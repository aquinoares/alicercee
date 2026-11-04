import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ALLOWED_ORIGINS = new Set([
  "https://alicerce-app.vercel.app",
  "https://alicerce-swart.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:4310",
  "http://127.0.0.1:4310",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);
const ALLOWED_REPETITIONS = ["nenhuma", "diaria", "semanal", "mensal", "anual"];
const ALLOWED_ALERTS = [0, 10, 60, 1440, 10080];

function allowedOrigin(origin: string) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  const out: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && allowedOrigin(origin)) out["Access-Control-Allow-Origin"] = origin;
  return out;
}

function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function parseSecretJson(value: string | undefined) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return typeof parsed.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}

function cleanText(value: unknown, max: number) {
  return String(value === null || typeof value === "undefined" ? "" : value)
    .replace(/\u0000/g, "").trim().slice(0, max);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  if (!value) return true;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const parts = value.split(":");
  return Number(parts[0]) >= 0 && Number(parts[0]) <= 23 &&
    Number(parts[1]) >= 0 && Number(parts[1]) <= 59;
}

function sanitizeReminder(input: any, partial: boolean) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("Dados do lembrete inválidos."), { status: 400 });
  }
  const result: Record<string, unknown> = {};
  if (!partial || typeof input.descricao !== "undefined") {
    const description = cleanText(input.descricao, 180);
    if (!description) throw Object.assign(new Error("Informe o que devo lembrar."), { status: 400 });
    result.descricao = description;
  }
  if (!partial || typeof input.data !== "undefined") {
    const date = cleanText(input.data, 10);
    if (!validDate(date)) throw Object.assign(new Error("A data do lembrete é inválida."), { status: 400 });
    result.data = date;
  }
  if (!partial || typeof input.hora !== "undefined") {
    const time = cleanText(input.hora, 5);
    if (!validTime(time)) throw Object.assign(new Error("O horário do lembrete é inválido."), { status: 400 });
    result.hora = time;
  }
  if (!partial || typeof input.detalhes !== "undefined") {
    result.detalhes = cleanText(input.detalhes, 2000);
  }
  if (!partial || typeof input.repeticao !== "undefined") {
    const repetition = cleanText(input.repeticao || "nenhuma", 12).toLowerCase();
    if (ALLOWED_REPETITIONS.indexOf(repetition) < 0) {
      throw Object.assign(new Error("A repetição escolhida não é permitida."), { status: 400 });
    }
    result.repeticao = repetition;
  }
  if (!partial || typeof input.avisos !== "undefined") {
    const alerts = Array.isArray(input.avisos) ? input.avisos : [0];
    if (alerts.length > 5) throw Object.assign(new Error("Quantidade de avisos inválida."), { status: 400 });
    const unique: number[] = Array.from(new Set<number>(alerts.map(function(value: unknown) { return Number(value); })));
    if (unique.some(function(value) { return ALLOWED_ALERTS.indexOf(value) < 0; })) {
      throw Object.assign(new Error("Intervalo de aviso não permitido."), { status: 400 });
    }
    result.avisos = unique;
  }
  return result;
}

async function authenticate(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = req.headers.get("apikey") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    parseSecretJson(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    parseSecretJson(Deno.env.get("SUPABASE_SECRET_KEYS"));

  if (!token || !url || !publishableKey) {
    throw Object.assign(new Error("Sessão ausente ou inválida."), { status: 401 });
  }
  if (!serviceKey) {
    throw Object.assign(new Error("Configuração segura do serviço indisponível."), { status: 503 });
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const auth = await authClient.auth.getUser(token);
  if (auth.error || !auth.data.user) {
    throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return { user: auth.data.user, admin: admin };
}

function safeReminder(item: any) {
  return {
    id: String(item.id || ""),
    tipo: "lembrete",
    descricao: cleanText(item.descricao, 180),
    data: String(item.data || ""),
    hora: cleanText(item.hora, 5),
    detalhes: cleanText(item.detalhes, 2000),
    repeticao: ALLOWED_REPETITIONS.indexOf(String(item.repeticao || "nenhuma")) >= 0
      ? String(item.repeticao || "nenhuma") : "nenhuma",
    avisos: Array.isArray(item.avisos) ? item.avisos.filter(function(value: unknown) {
      return ALLOWED_ALERTS.indexOf(Number(value)) >= 0;
    }).slice(0, 5) : [0],
    feitos: Array.isArray(item.feitos) ? item.feitos.filter(function(value: unknown) {
      return validDate(String(value));
    }).slice(-365) : [],
    status: item.status === "concluido" ? "concluido" : "pendente"
  };
}

async function readReminders(admin: any, userId: string) {
  const result = await admin.from("alicerce_data")
    .select("data")
    .eq("user_id", userId)
    .eq("store_name", "commitments")
    .maybeSingle();
  if (result.error) {
    throw Object.assign(new Error("Não foi possível consultar seus lembretes."), { status: 503 });
  }
  const values = result.data && Array.isArray(result.data.data) ? result.data.data : [];
  return values.filter(function(item: any) {
    return item && typeof item === "object" && item.tipo === "lembrete";
  }).slice(-200).map(safeReminder);
}

function safeCommitment(item: any) {
  const rawValue = item && item.valor !== null && typeof item.valor !== "undefined"
    ? Number(item.valor)
    : null;
  return {
    id: String(item.id || ""),
    tipo: "compromisso",
    descricao: cleanText(item.descricao, 180),
    data: cleanText(item.data, 10),
    hora: cleanText(item.hora || item.horario, 5),
    valor: rawValue !== null && Number.isFinite(rawValue) ? rawValue : null,
    status: cleanText(item.status || "pendente", 32)
  };
}

async function readCommitments(admin: any, userId: string) {
  const result = await admin.from("alicerce_data")
    .select("data")
    .eq("user_id", userId)
    .eq("store_name", "commitments")
    .maybeSingle();
  if (result.error) {
    throw Object.assign(new Error("Não foi possível consultar seus compromissos."), { status: 503 });
  }
  const values = result.data && Array.isArray(result.data.data) ? result.data.data : [];
  return values.filter(function(item: any) {
    return item && typeof item === "object" && item.tipo === "compromisso";
  }).slice(-300).map(safeCommitment);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigin(origin)) return reply(req, { error: "Origem não autorizada." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Método não permitido." }, 405);

  try {
    const auth = await authenticate(req);
    const body = await req.json().catch(function() { return null; });
    if (!body || typeof body.action !== "string") {
      return reply(req, { error: "Ação ausente." }, 400);
    }
    const action = String(body.action);
    const userId = auth.user.id;

    if (action === "reminder.list") {
      return reply(req, { ok: true, reminders: await readReminders(auth.admin, userId) });
    }
    if (action === "commitment.list") {
      return reply(req, { ok: true, commitments: await readCommitments(auth.admin, userId) });
    }

    if (["reminder.create", "reminder.update", "reminder.complete", "reminder.delete"].indexOf(action) < 0) {
      return reply(req, { error: "Esta ação não está disponível para a Alicia." }, 403);
    }

    const idempotencyKey = cleanText(body.idempotency_key, 128);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return reply(req, { error: "Identificador da ação inválido. Tente novamente." }, 400);
    }

    const reminderId = cleanText(body.reminder_id, 80);
    const confirmed = body.confirmed === true;
    let reminder: Record<string, unknown> = {};
    let occurrenceDate: string | null = null;

    if (action === "reminder.create") {
      reminder = sanitizeReminder(body.reminder, false);
    } else if (action === "reminder.update") {
      if (!reminderId) return reply(req, { error: "Escolha o lembrete que deseja alterar." }, 400);
      reminder = sanitizeReminder(body.reminder, true);
    } else if (action === "reminder.complete") {
      if (!reminderId) return reply(req, { error: "Escolha o lembrete que deseja concluir." }, 400);
      occurrenceDate = cleanText(body.occurrence_date, 10);
      if (!validDate(occurrenceDate)) return reply(req, { error: "Data de conclusão inválida." }, 400);
    } else {
      if (!reminderId) return reply(req, { error: "Escolha o lembrete que deseja excluir." }, 400);
      if (!confirmed) return reply(req, { error: "A exclusão precisa de confirmação explícita." }, 409);
    }

    const fingerprintInput = JSON.stringify({
      action: action,
      reminder: reminder,
      reminder_id: reminderId || null,
      occurrence_date: occurrenceDate,
      confirmed: confirmed
    });
    const fingerprintBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(fingerprintInput)
    );
    const requestFingerprint = Array.from(new Uint8Array(fingerprintBuffer))
      .map(function(value: number) { return value.toString(16).padStart(2, "0"); })
      .join("");

    const mutation = await auth.admin.rpc("alicia_mutate_commitments", {
      p_user_id: userId,
      p_action: action,
      p_reminder: reminder,
      p_reminder_id: reminderId || null,
      p_occurrence_date: occurrenceDate,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
      p_confirmed: confirmed
    });
    if (mutation.error || !mutation.data || mutation.data.ok !== true) {
      console.error("ALICIA_ACTION_FAILED", action, mutation.error ? mutation.error.message : "invalid_result");
      return reply(req, { error: mutation.error ? "Não foi possível concluir essa ação." : "A ação não foi confirmada pelo serviço." }, 503);
    }

    const reminders = await readReminders(auth.admin, userId);
    const target = reminders.find(function(item: any) { return item.id === String(mutation.data.reminder_id || reminderId); }) || null;
    return reply(req, {
      ok: true,
      action: action,
      duplicate: mutation.data.duplicate === true,
      reminder: action === "reminder.delete" ? null : target,
      reminders: reminders
    });
  } catch (error) {
    const typed = error as any;
    console.error("ALICIA_ACTIONS_ERROR", typed && typed.message ? typed.message : String(error));
    return reply(req, {
      error: error instanceof Error ? error.message : "Não foi possível executar a ação.",
      code: typed && typed.code ? typed.code : "ALICIA_ACTIONS_ERROR"
    }, typed && typed.status ? typed.status : 500);
  }
});
