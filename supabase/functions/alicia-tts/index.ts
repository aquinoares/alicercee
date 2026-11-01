import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const allowedOrigins = new Set([
  "https://alicerce-swart.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function makeCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://alicerce-swart.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(
  data: unknown,
  status: number,
  cors: Record<string, string>,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const cors = makeCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: "Origem não autorizada." }, 403, cors);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405, cors);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Sessão não autenticada." }, 401, cors);
    }

    const accessToken = authHeader.slice(7).trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      (() => {
        try {
          const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
          return keys.default || "";
        } catch {
          return "";
        }
      })();

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Autenticação do serviço indisponível." }, 503, cors);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !userData.user) {
      return jsonResponse({ error: "Sessão inválida ou expirada." }, 401, cors);
    }

    const body = await req.json().catch(() => null);
    const text = String(body?.text || body?.input || "").trim();
    if (!text) {
      return jsonResponse({ error: "Não há texto para narrar." }, 400, cors);
    }
    if (text.length > 1000) {
      return jsonResponse({ error: "A resposta é muito longa para leitura por voz." }, 413, cors);
    }

    const serviceUrl = (Deno.env.get("ALICIA_TTS_URL") || "").replace(/\/+$/, "");
    const serviceKey = Deno.env.get("ALICIA_TTS_API_KEY") || "";
    if (!serviceUrl || !serviceKey) {
      return jsonResponse({ error: "O serviço de voz ainda não foi configurado." }, 503, cors);
    }

    const upstream = await fetch(serviceUrl + "/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + serviceKey,
        "Content-Type": "application/json",
        "X-Alicia-User": userData.user.id,
      },
      body: JSON.stringify({ input: text }),
      signal: AbortSignal.timeout(45000),
    });

    if (!upstream.ok || !upstream.body) {
      return jsonResponse(
        { error: "Não foi possível gerar o áudio agora." },
        upstream.status === 429 ? 429 : 502,
        cors,
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Alicia-Voice": "pt-BR-FranciscaNeural",
      },
    });
  } catch (error) {
    console.error("Falha no proxy de voz da Alicia:", error);
    return jsonResponse({ error: "Serviço de voz temporariamente indisponível." }, 502, cors);
  }
});
