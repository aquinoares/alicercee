import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ALLOWED_EVENTS = new Set([
  "app_opened",
  "financial_record_created",
  "first_movement_created"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins() {
  const configured = (Deno.env.get("ALICERCE_ANALYTICS_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    "https://alicerce-swart.vercel.app",
    "http://127.0.0.1:4310",
    "http://localhost:4310",
    "http://127.0.0.1:4173",
    "http://localhost:4173"
  ];
  return new Set(configured.length ? configured : defaults);
}

function responseHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(req)
  });
}

function getPublishableKey(req: Request) {
  const requestKey = req.headers.get("apikey") || "";
  if (requestKey) return requestKey;
  const direct = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    return keys.default || "";
  } catch {
    return "";
  }
}

function getToken(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

async function readBody(req: Request) {
  const raw = await req.text();
  if (raw.length > 1024) throw new Error("Corpo excede o limite permitido.");
  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new Error("JSON inválido.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("O corpo precisa ser um objeto JSON.");
  }
  return body as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse(req, { error: "Origem não autorizada." }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Método não permitido." }, 405);
  }

  const token = getToken(req);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = getPublishableKey(req);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!token) return jsonResponse(req, { error: "Sessão não autenticada." }, 401);
  if (!url || !publishableKey || !serviceRoleKey) {
    return jsonResponse(req, { error: "O serviço de eventos não está configurado." }, 503);
  }

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } }
  });
  const auth = await userClient.auth.getUser(token);
  if (auth.error || !auth.data || !auth.data.user) {
    return jsonResponse(req, { error: "Sessão inválida ou expirada." }, 401);
  }
  const userId = auth.data.user.id;

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch (error) {
    return jsonResponse(req, { error: error instanceof Error ? error.message : "Requisição inválida." }, 400);
  }

  if (body.action === "revoke") {
    if (Object.keys(body).length !== 1) {
      return jsonResponse(req, { error: "Requisição de revogação inválida." }, 400);
    }
    const deletion = await adminClient
      .from("alicerce_product_events")
      .delete()
      .eq("user_id", userId);
    if (deletion.error) {
      return jsonResponse(req, { error: "Não foi possível apagar os eventos anteriores." }, 503);
    }
    return jsonResponse(req, { ok: true, deleted: true });
  }

  if (body.action !== "track" || Object.keys(body).sort().join(",") !== "action,event_id,event_name") {
    return jsonResponse(req, { error: "Payload não permitido." }, 400);
  }

  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const eventName = typeof body.event_name === "string" ? body.event_name : "";
  if (!UUID_PATTERN.test(eventId) || !ALLOWED_EVENTS.has(eventName)) {
    return jsonResponse(req, { error: "Evento inválido." }, 400);
  }

  const settingsResult = await adminClient
    .from("alicerce_data")
    .select("data")
    .eq("user_id", userId)
    .eq("store_name", "settings")
    .maybeSingle();
  if (settingsResult.error) {
    return jsonResponse(req, { error: "Não foi possível confirmar a preferência de privacidade." }, 503);
  }
  const settings = settingsResult.data && settingsResult.data.data;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.analyticsConsent !== true) {
    return jsonResponse(req, { error: "O compartilhamento de eventos não está autorizado nesta conta." }, 403);
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await adminClient
    .from("alicerce_product_events")
    .select("event_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", cutoff);
  if (recent.error) {
    return jsonResponse(req, { error: "Não foi possível verificar o limite de eventos." }, 503);
  }
  if ((recent.count || 0) >= 120) {
    return jsonResponse(req, { error: "Limite de eventos desta conta atingido. Tente novamente mais tarde." }, 429);
  }

  const insertion = await adminClient
    .from("alicerce_product_events")
    .insert({
      event_id: eventId,
      user_id: userId,
      event_name: eventName
    });

  if (insertion.error) {
    if (insertion.error.code === "23505" && eventName === "first_movement_created") {
      return jsonResponse(req, { ok: true, duplicate: true });
    }
    if (insertion.error.code === "23505") {
      return jsonResponse(req, { ok: true, duplicate: true });
    }
    return jsonResponse(req, { error: "Não foi possível registrar o evento." }, 503);
  }

  return jsonResponse(req, { ok: true });
});
