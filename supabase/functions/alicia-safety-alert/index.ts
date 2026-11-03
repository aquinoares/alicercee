import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const allowedOrigins = new Set([
  "https://alicerce-app.vercel.app",
  "https://alicerce-swart.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://alicerce-app.vercel.app",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req.headers.get("Origin") || ""),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function parseDefaultSecret(value: string | undefined) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return typeof parsed.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}

function getPublishableKey(req: Request) {
  return req.headers.get("apikey") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    parseDefaultSecret(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
}

function getServiceKey() {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    parseDefaultSecret(Deno.env.get("SUPABASE_SECRET_KEYS"));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json(req, { error: "Sessão não autenticada." }, 401);
    }

    const token = authorization.slice(7).trim();
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = getPublishableKey(req);
    const serviceKey = getServiceKey();

    if (!token || !url || !publishableKey || !serviceKey) {
      return json(req, { error: "Configuração de autenticação indisponível." }, 503);
    }

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const authResult = await userClient.auth.getUser(token);
    if (authResult.error || !authResult.data.user) {
      return json(req, { error: "Sessão inválida ou expirada." }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(req, { error: "Evento inválido." }, 400);
    }
    const allowedKeys = Object.keys(body);
    if (allowedKeys.length !== 1 || allowedKeys[0] !== "type") {
      return json(req, { error: "Somente o tipo do alerta é aceito." }, 400);
    }

    const type = String(body.type || "");
    if (type !== "self_safety" && type !== "third_party_safety") {
      return json(req, { error: "Tipo de alerta inválido." }, 400);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const summary = type === "self_safety"
      ? "ALERTA_INTERNO: crise_autorreferida"
      : "ALERTA_INTERNO: risco_a_terceiros";
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const recent = await adminClient.from("logs_ia")
      .select("id")
      .eq("usuario_id", authResult.data.user.id)
      .eq("agente", "alicia")
      .eq("tipo", "chat")
      .eq("modelo", "alicia-local-brain-v2")
      .eq("entrada_resumo", summary)
      .gte("criado_em", cutoff)
      .limit(1);

    if (recent.error) {
      console.error("ALICIA_SAFETY_ALERT_LOOKUP_FAILED");
      return json(req, { error: "Não foi possível registrar o alerta." }, 503);
    }
    if (recent.data && recent.data.length) return json(req, { received: true, duplicate: true });

    const inserted = await adminClient.from("logs_ia").insert({
      usuario_id: authResult.data.user.id,
      agente: "alicia",
      tipo: "chat",
      modelo: "alicia-local-brain-v2",
      status: "sucesso",
      entrada_resumo: summary,
      saida_resumo: "alerta_interno_registrado_sem_conteudo_de_conversa",
      duracao_ms: 0,
      tentativa: 1,
      origem: "legado"
    });

    if (inserted.error) {
      console.error("ALICIA_SAFETY_ALERT_INSERT_FAILED");
      return json(req, { error: "Não foi possível registrar o alerta." }, 503);
    }
    return json(req, { received: true, duplicate: false });
  } catch {
    console.error("ALICIA_SAFETY_ALERT_UNEXPECTED");
    return json(req, { error: "Serviço de alerta temporariamente indisponível." }, 502);
  }
});
