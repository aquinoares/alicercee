import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { aggregateGrowthSignals } from "./aggregate.js";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
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

async function readCompleteRows(adminClient: any, tableName: string, columns: string, orderColumn = "id") {
  const pageSize = 1000;
  const maxRows = 20000;
  const rows: any[] = [];
  let expectedCount: number | null = null;

  for (let start = 0; start < maxRows; start += pageSize) {
    const result = await adminClient
      .from(tableName)
      .select(columns, { count: "exact" })
      .order("created_at", { ascending: true })
      .order(orderColumn, { ascending: true })
      .range(start, start + pageSize - 1);

    if (result.error || !Array.isArray(result.data)) {
      throw new Error("Não foi possível ler a fonte agregada " + tableName + ".");
    }
    if (start === 0) {
      expectedCount = Number(result.count);
      if (!Number.isInteger(expectedCount) || expectedCount < 0) {
        throw new Error("A fonte " + tableName + " não informou a contagem completa.");
      }
      if (expectedCount > maxRows) {
        throw new Error("A fonte " + tableName + " excedeu o limite de leitura completa.");
      }
    }

    rows.push(...result.data);
    if (rows.length === expectedCount) return rows;
    if (rows.length > (expectedCount as number) || result.data.length === 0) {
      throw new Error("A paginação da fonte " + tableName + " ficou incompleta.");
    }
  }

  throw new Error("A leitura da fonte " + tableName + " atingiu o limite sem completar a paginação.");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return jsonResponse({ error: "Método não permitido." }, 405);
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return jsonResponse({ error: "Sessão não autenticada." }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = getPublishableKey(req);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !publishableKey || !serviceRoleKey) {
    return jsonResponse({ error: "A leitura agregada não está configurada no servidor." }, 503);
  }

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } }
  });
  const auth = await userClient.auth.getUser(token);
  if (auth.error || !auth.data || !auth.data.user) {
    return jsonResponse({ error: "Sessão inválida ou expirada." }, 401);
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const caller = await adminClient.from("admins").select("user_id").eq("user_id", auth.data.user.id).maybeSingle();
  if (caller.error) return jsonResponse({ error: "Não foi possível conferir a permissão administrativa." }, 503);
  if (!caller.data) return jsonResponse({ error: "Acesso administrativo negado." }, 403);

  const pageSize = 1000;
  const maxPages = 20;
  const users: any[] = [];
  let usersComplete = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await adminClient.auth.admin.listUsers({ page: page, perPage: pageSize });
    if (result.error || !result.data || !Array.isArray(result.data.users)) {
      return jsonResponse({ error: "Não foi possível completar a leitura das contas." }, 503);
    }
    users.push(...result.data.users.map(function (user: any) {
      return { id: user.id, created_at: user.created_at };
    }));
    if (result.data.users.length < pageSize) {
      usersComplete = true;
      break;
    }
  }
  if (!usersComplete) {
    return jsonResponse({ error: "A leitura atingiu o limite de paginação; nenhum total parcial foi publicado." }, 503);
  }

  const adminRows = await adminClient.from("admins").select("user_id").limit(10000);
  if (adminRows.error || !Array.isArray(adminRows.data)) {
    return jsonResponse({ error: "Não foi possível excluir contas administrativas do relatório." }, 503);
  }
  const adminIds = new Set(adminRows.data.map(function (row: any) { return row.user_id; }));

  const subscriptionRows: any[] = [];
  let subscriptionsComplete = false;
  for (let start = 0; start < 20000; start += pageSize) {
    const result = await adminClient
      .from("subscriptions")
      .select("user_id,plan,status,expires_at,started_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (result.error || !Array.isArray(result.data)) {
      return jsonResponse({ error: "Não foi possível completar a leitura das assinaturas." }, 503);
    }
    subscriptionRows.push(...result.data);
    if (result.data.length < pageSize) {
      subscriptionsComplete = true;
      break;
    }
  }
  if (!subscriptionsComplete) {
    return jsonResponse({ error: "A leitura atingiu o limite de assinaturas; nenhum total parcial foi publicado." }, 503);
  }

  const latestByUser = new Map<string, any>();
  subscriptionRows.forEach(function (row: any) {
    const previous = latestByUser.get(row.user_id);
    const currentTime = Date.parse(row.updated_at || row.created_at || row.started_at || "");
    const previousTime = previous ? Date.parse(previous.updated_at || previous.created_at || previous.started_at || "") : -Infinity;
    if (!previous || (Number.isFinite(currentTime) && currentTime >= previousTime)) latestByUser.set(row.user_id, row);
  });

  const customers = users.filter(function (user: any) { return !adminIds.has(user.id); });
  const now = Date.now();
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  let active = 0;
  let inactive = 0;
  let withoutSubscription = 0;
  let newCustomers30d = 0;
  const planMap = new Map<string, { active: number; inactive: number }>();

  customers.forEach(function (user: any) {
    const createdAt = Date.parse(user.created_at || "");
    if (Number.isFinite(createdAt) && createdAt >= cutoff) newCustomers30d += 1;
    const subscription = latestByUser.get(user.id);
    if (!subscription) {
      inactive += 1;
      withoutSubscription += 1;
      return;
    }
    const expiry = subscription.expires_at ? Date.parse(subscription.expires_at) : null;
    const isActive = subscription.status === "active" && (expiry === null || (Number.isFinite(expiry) && expiry > now));
    const plan = String(subscription.plan || "não informado").toLowerCase();
    const entry = planMap.get(plan) || { active: 0, inactive: 0 };
    if (isActive) {
      active += 1;
      entry.active += 1;
    } else {
      inactive += 1;
      entry.inactive += 1;
    }
    planMap.set(plan, entry);
  });

  const total = customers.length;
  const percent = function (value: number) {
    return total ? Math.round(value / total * 1000) / 10 : null;
  };
  const planBreakdown = Array.from(planMap.entries()).map(function ([plan, counts]) {
    return { plan: plan, active: counts.active, inactive: counts.inactive, total: counts.active + counts.inactive };
  }).sort(function (a, b) { return a.plan.localeCompare(b.plan); });

  let growthRows: { adRows: any[]; trafficRows: any[]; referralRows: any[]; usageRows: any[] };
  try {
    growthRows = {
      adRows: await readCompleteRows(adminClient, "customer_ads", "id,status,created_at"),
      trafficRows: await readCompleteRows(adminClient, "ad_traffic_events", "id,event_type,created_at"),
      referralRows: await readCompleteRows(adminClient, "referrals", "id,created_at"),
      usageRows: await readCompleteRows(
        adminClient,
        "alicerce_product_events",
        "event_id,user_id,event_name,created_at",
        "event_id"
      )
    };
  } catch {
    return jsonResponse({ error: "Não foi possível completar a leitura de anúncios, tráfego, indicações e eventos de uso; nenhum agregado parcial foi publicado." }, 503);
  }

  const acquisition = aggregateGrowthSignals({
    adRows: growthRows.adRows,
    trafficRows: growthRows.trafficRows,
    referralRows: growthRows.referralRows,
    usageRows: growthRows.usageRows,
    referenceTime: new Date(now)
  });

  return jsonResponse({
    source: "Supabase Auth + public.subscriptions + public.customer_ads + public.ad_traffic_events + public.referrals",
    referenceTime: new Date(now).toISOString(),
    statusDefinition: "Cliente ativo = conta não administrativa com assinatura mais recente em status=active e sem vencimento ou com expires_at futuro. Os demais são inativos para fins de assinatura.",
    totals: {
      registeredCustomers: total,
      activeCustomers: active,
      inactiveCustomers: inactive,
      customersWithoutSubscription: withoutSubscription,
      newCustomersLast30Days: newCustomers30d,
      activeSharePercent: percent(active),
      inactiveSharePercent: percent(inactive)
    },
    planBreakdown: planBreakdown,
    acquisition: acquisition,
    dataQuality: {
      confidence: "high",
      reason: "Contas e assinaturas foram lidas em páginas completas; administradores foram excluídos; o status considera a data de vencimento.",
      limitations: [
        "Ativo significa assinatura vigente, não uso recente do aplicativo.",
        "CAC, LTV, ROI, ROAS, CPL, conversão por etapa, ticket, churn, payback e margem não são calculáveis sem fontes próprias de aquisição, receita, pedidos e eventos.",
        "Nenhum nome, e-mail, telefone, identificador de usuário ou dado financeiro individual é retornado."
      ]
    }
  });
});
