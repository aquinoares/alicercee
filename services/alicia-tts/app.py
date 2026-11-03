import asyncio
import hmac
import logging
import os
import time
from collections import deque
from typing import Deque

import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

VOICE_ID = "pt-BR-FranciscaNeural"
MAX_TEXT_LENGTH = 1000
RATE_LIMIT_REQUESTS = 30
RATE_LIMIT_WINDOW_SECONDS = 600

app = FastAPI(title="Alicerce Alicia TTS", docs_url=None, redoc_url=None)
_generation_slots = asyncio.Semaphore(2)
_user_requests: dict[str, Deque[float]] = {}


class SpeechRequest(BaseModel):
    input: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


def _validate_user_quota(user_id: str) -> None:
    now = time.monotonic()
    events = _user_requests.setdefault(user_id, deque())

    while events and now - events[0] > RATE_LIMIT_WINDOW_SECONDS:
        events.popleft()

    if len(events) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(status_code=429, detail="Limite temporário de áudio atingido.")

    events.append(now)

    if len(_user_requests) > 5000:
        stale_before = now - RATE_LIMIT_WINDOW_SECONDS
        for key in list(_user_requests):
            queue = _user_requests[key]
            while queue and queue[0] <= stale_before:
                queue.popleft()
            if not queue:
                _user_requests.pop(key, None)


@app.get("/health")
async def health():
    return {"ok": True, "service": "alicerce-alicia-tts", "voice": VOICE_ID}


@app.post("/v1/audio/speech")
async def generate_speech(
    payload: SpeechRequest,
    authorization: str | None = Header(default=None),
    x_alicia_user: str | None = Header(default=None),
):
    expected_key = os.environ.get("ALICIA_TTS_API_KEY", "")
    if not expected_key:
        raise HTTPException(status_code=503, detail="Serviço de voz não configurado.")

    supplied_key = ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied_key = authorization[7:].strip()

    if not supplied_key or not hmac.compare_digest(supplied_key, expected_key):
        raise HTTPException(status_code=401, detail="Não autorizado.")

    user_id = (x_alicia_user or "").strip()
    if not user_id or len(user_id) > 128:
        raise HTTPException(status_code=400, detail="Identificação de usuário inválida.")

    text = payload.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio.")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Texto muito longo.")

    _validate_user_quota(user_id)

    try:
        async with _generation_slots:
            communicator = edge_tts.Communicate(
                text=text,
                voice=VOICE_ID,
                rate="+0%",
                pitch="+0Hz",
            )
            audio_parts: list[bytes] = []
            async for chunk in communicator.stream():
                if chunk.get("type") == "audio":
                    audio_parts.append(chunk["data"])

        audio_bytes = b"".join(audio_parts)
        if not audio_bytes:
            raise RuntimeError("O provedor não retornou áudio.")

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Alicia-Voice": VOICE_ID,
            },
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("Falha ao gerar áudio da Alicia; texto omitido.")
        raise HTTPException(status_code=502, detail="A voz está temporariamente indisponível.")
