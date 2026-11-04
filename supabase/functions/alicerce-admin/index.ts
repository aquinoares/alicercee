import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://alicerce-swart.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}


function normalizeCommercialEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidCommercialEmail(email: string): boolean {
  return email.length <= 254 && email.indexOf("@") > 0 && email.indexOf(" ") < 0 && email.lastIndexOf(".") > email.indexOf("@") + 1 && email.lastIndexOf(".") < email.length - 1;
}

async function findAuthUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("AUTH_USER_LOOKUP_FAILED");
    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((candidate: any) =>
      normalizeCommercialEmail(candidate?.email) === email
    );
    if (found) return found;
    if (users.length < 1000) return null;
  }
  throw new Error("AUTH_USER_LOOKUP_LIMIT_REACHED");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed",
        },
        405
      );
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        {
          ok: false,
          error: "Token não enviado",
        },
        401
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json(
        {
          ok: false,
          error: "Configuração do Supabase ausente",
        },
        500
      );
    }

    // Cliente normal para validar o usuário autenticado
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("ERRO_AUTH:", userError?.message);

      return json(
        {
          ok: false,
          error: "Usuário não autenticado",
        },
        401
      );
    }

    // Cliente administrativo.
    // Esta chave NUNCA vai para o navegador.
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // Confirma que o usuário é administrador.
    const { data: admin, error: adminError } = await adminClient
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("ERRO_ADMIN:", adminError.message);

      return json(
        {
          ok: false,
          error: "Erro ao verificar administrador",
        },
        500
      );
    }

    if (!admin) {
      return json(
        {
          ok: false,
          error: "Acesso administrativo negado",
        },
        403
      );
    }

    // Lê a ação solicitada pelo painel.
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // Consulta comercial limitada: plano e estado de acesso; sem dados financeiros.
    if (action === "inspect_commercial_account") {
      const email = normalizeCommercialEmail(body?.email);
      if (!isValidCommercialEmail(email)) {
        return json({ ok: false, error: "Informe um e-mail válido." }, 400);
      }
      const targetUser = await findAuthUserByEmail(adminClient, email);
      if (!targetUser) {
        return json({ ok: true, found: false, accountStatus: "not_found" });
      }
      const now = new Date().toISOString();
      const { data: subscription, error: subscriptionError } = await adminClient
        .from("subscriptions")
        .select("plan,status,expires_at")
        .eq("user_id", targetUser.id)
        .maybeSingle();
      if (subscriptionError) {
        console.error("ERRO_CONSULTAR_STATUS_COMERCIAL");
        return json({ ok: false, error: "Não foi possível verificar o plano da conta." }, 503);
      }
      const { data: grants, error: grantsError } = await adminClient
        .from("temporary_access_grants")
        .select("plan,starts_at,expires_at,revoked_at")
        .eq("user_id", targetUser.id)
        .is("revoked_at", null)
        .gt("expires_at", now)
        .order("expires_at", { ascending: false })
        .limit(1);
      if (grantsError) {
        console.error("ERRO_CONSULTAR_ACESSO_TEMPORARIO");
        return json({ ok: false, error: "Não foi possível verificar benefícios temporários." }, 503);
      }
      const currentPlan = String(subscription?.plan || "free").toLowerCase();
      const subscriptionStatus = String(subscription?.status || "inactive").toLowerCase();
      const expiry = subscription?.expires_at ? Date.parse(subscription.expires_at) : null;
      const paidPlanActive = subscriptionStatus === "active" &&
        ["pro", "vip", "infinit"].includes(currentPlan) &&
        (expiry === null || (Number.isFinite(expiry) && expiry > Date.now()));
      const trialPlanActive = subscriptionStatus === "active" && currentPlan === "trial" &&
        (expiry === null || (Number.isFinite(expiry) && expiry > Date.now()));
      const activeGrant = Array.isArray(grants) ? grants.find((grant: any) => {
        const starts = Date.parse(grant.starts_at);
        const ends = Date.parse(grant.expires_at);
        return grant.plan === "pro" && Number.isFinite(starts) &&
          Number.isFinite(ends) && starts <= Date.now() && ends > Date.now();
      }) || null : null;
      return json({
        ok: true,
        found: true,
        accountStatus: paidPlanActive ? "paid_active" : trialPlanActive ? "trial_active" : activeGrant ? "temporary_access_active" :
          subscriptionStatus === "active" ? "free_or_non_paid_active" : "inactive",
        subscription: {
          plan: currentPlan,
          status: subscriptionStatus,
          expires_at: subscription?.expires_at || null
        },
        temporaryAccess: activeGrant ? {
          plan: activeGrant.plan,
          starts_at: activeGrant.starts_at,
          expires_at: activeGrant.expires_at
        } : null
      });
    }

    // Captura dados de contato fornecidos para esta finalidade. Não envia e-mail.
    if (action === "capture_commercial_lead") {
      const email = normalizeCommercialEmail(body?.email);
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
      const interestedPlan = String(body?.interested_plan || "unknown").trim().toLowerCase();
      const contactConsent = body?.contact_consent === true;
      const emailSubject = typeof body?.email_subject === "string" ? body.email_subject.trim().slice(0, 180) : "";
      const emailBody = typeof body?.email_body === "string" ? body.email_body.trim().slice(0, 12000) : "";
      if (!isValidCommercialEmail(email)) {
        return json({ ok: false, error: "Informe um e-mail válido para registrar o lead." }, 400);
      }
      if (!["normal", "pro", "infinit", "unknown"].includes(interestedPlan)) {
        return json({ ok: false, error: "Plano de interesse inválido." }, 400);
      }
      const now = new Date().toISOString();
      const { data: existingLead, error: existingError } = await adminClient
        .from("commercial_leads")
        .select("id,status")
        .eq("email", email)
        .maybeSingle();
      if (existingError) {
        console.error("ERRO_LOCALIZAR_LEAD_COMERCIAL");
        return json({ ok: false, error: "Não foi possível consultar o lead." }, 503);
      }
      const leadValues = {
        name: name || null,
        interested_plan: interestedPlan,
        contact_consent: contactConsent,
        consent_recorded_at: contactConsent ? now : null,
        email_subject: emailSubject || null,
        email_body: emailBody || null,
        updated_by: user.id,
        updated_at: now
      };
      let lead;
      let leadError;
      if (existingLead?.id) {
        const result = await adminClient
          .from("commercial_leads")
          .update(leadValues)
          .eq("id", existingLead.id)
          .select("id,email,interested_plan,contact_consent,status,updated_at")
          .single();
        lead = result.data;
        leadError = result.error;
      } else {
        const result = await adminClient
          .from("commercial_leads")
          .insert({
            email: email,
            source: "hera",
            status: "new",
            created_by: user.id,
            ...leadValues
          })
          .select("id,email,interested_plan,contact_consent,status,updated_at")
          .single();
        lead = result.data;
        leadError = result.error;
      }
      if (leadError) {
        console.error("ERRO_GRAVAR_LEAD_COMERCIAL");
        return json({ ok: false, error: "Não foi possível registrar o lead." }, 503);
      }
      return json({ ok: true, lead: lead, created: !existingLead?.id });
    }

    // Concessão exclusiva de Pro promocional, em tabela própria, sem alterar subscriptions.
    if (action === "grant_temporary_access") {
      const email = normalizeCommercialEmail(body?.email);
      const days = body?.days === undefined ? 15 : Number(body.days);
      const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (!isValidCommercialEmail(email)) {
        return json({ ok: false, error: "Informe um e-mail válido para liberar o acesso." }, 400);
      }
      if (!Number.isInteger(days) || days < 1 || days > 30) {
        return json({ ok: false, error: "O período precisa ser de 1 a 30 dias." }, 400);
      }
      if (reason.length < 5) {
        return json({ ok: false, error: "Informe o motivo da concessão temporária." }, 400);
      }
      const targetUser = await findAuthUserByEmail(adminClient, email);
      if (!targetUser) {
        return json({ ok: false, code: "ACCOUNT_NOT_FOUND", error: "Não existe uma conta Alicerce com esse e-mail." }, 404);
      }
      const { data: grantRows, error: grantError } = await adminClient.rpc(
        "grant_temporary_pro_access",
        {
          p_user_id: targetUser.id,
          p_days: days,
          p_reason: reason,
          p_granted_by: user.id
        }
      );
      if (grantError) {
        const message = String(grantError.message || "");
        if (message.includes("ACTIVE_PAID_SUBSCRIPTION")) {
          return json({ ok: false, code: "ACTIVE_PAID_SUBSCRIPTION", error: "A conta já possui um plano pago ativo. Nenhuma alteração foi feita." }, 409);
        }
        if (message.includes("ACTIVE_TEMPORARY_GRANT")) {
          return json({ ok: false, code: "ACTIVE_TEMPORARY_GRANT", error: "A conta já possui um acesso temporário vigente." }, 409);
        }
        if (message.includes("INVALID_GRANT_DAYS") || message.includes("INVALID_GRANT_REASON")) {
          return json({ ok: false, error: "Os dados da concessão temporária são inválidos." }, 400);
        }
        console.error("ERRO_CONCEDER_ACESSO_TEMPORARIO");
        return json({ ok: false, error: "Não foi possível conceder o acesso temporário." }, 503);
      }
      const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows;
      if (!grant?.id || !grant?.expires_at) {
        return json({ ok: false, error: "A concessão não retornou confirmação válida." }, 503);
      }
      return json({
        ok: true,
        access: {
          id: grant.id,
          plan: grant.plan,
          starts_at: grant.starts_at,
          expires_at: grant.expires_at
        }
      });
    }

    // Teste de acesso administrativo.
    if (!action || action === "check_admin") {
      return json({
        ok: true,
        admin: true,
        user_id: user.id,
        email: user.email,
        message: "Painel administrativo autorizado",
      });
    }

    // Pesquisa usuários.
    if (action === "list_users") {
      const search = String(body?.search || "")
        .trim()
        .toLowerCase();

      const { data: usersData, error: usersError } =
        await adminClient.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

      if (usersError) {
        console.error("ERRO_LISTAR_USUARIOS:", usersError.message);

        return json(
          {
            ok: false,
            error: "Não foi possível listar usuários",
          },
          500
        );
      }

      let users = usersData.users;

      if (search) {
        users = users.filter((u) => {
          const email = (u.email || "").toLowerCase();
          const name = String(u.user_metadata?.name || "").toLowerCase();

          return (
            email.includes(search) ||
            name.includes(search)
          );
        });
      }

      const results = [];

      for (const u of users.slice(0, 50)) {
        const { data: subscription } = await adminClient
          .from("subscriptions")
          .select(
            "plan,status,started_at,expires_at,provider"
          )
          .eq("user_id", u.id)
          .maybeSingle();

        results.push({
          user_id: u.id,
          email: u.email,
          name: u.user_metadata?.name || "",
          created_at: u.created_at,
          subscription: subscription || null,
        });
      }

      return json({
        ok: true,
        count: results.length,
        users: results,
      });
    }

    if (action === "set_subscription") {
      const userId = String(body?.user_id || "").trim();
      const plan = String(body?.plan || "").trim().toLowerCase();
      const status = String(body?.status || "active").trim().toLowerCase();
      const expiresAt = body?.expires_at
        ? String(body.expires_at)
        : null;
      const provider = String(body?.provider || "manual").trim().toLowerCase();

      const allowedPlans = [
        "free",
        "pro",
        "trial",
        "vitalicio"
      ];

      if (!userId) {
        return json(
          {
            ok: false,
            error: "user_id não informado",
          },
          400
        );
      }

      if (!allowedPlans.includes(plan)) {
        return json(
          {
            ok: false,
            error: "Plano inválido",
          },
          400
        );
      }

      if (status !== "active" && status !== "inactive") {
        return json(
          {
            ok: false,
            error: "Status inválido",
          },
          400
        );
      }

      if (plan === "pro" || plan === "trial") {
        if (!expiresAt) {
          return json(
            {
              ok: false,
              error: "Data de expiração obrigatória",
            },
            400
          );
        }

        const parsedDate = new Date(expiresAt);

        if (Number.isNaN(parsedDate.getTime())) {
          return json(
            {
              ok: false,
              error: "Data de expiração inválida",
            },
            400
          );
        }
      }

      const now = new Date().toISOString();

      const { data: subscription, error: subscriptionError } =
        await adminClient
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan,
              status,
              started_at: now,
              expires_at:
                plan === "vitalicio" || plan === "free"
                  ? null
                  : expiresAt,
              provider,
              provider_transaction_id: null,
              updated_at: now,
            },
            {
              onConflict: "user_id",
            }
          )
          .select(
            "user_id,plan,status,started_at,expires_at,provider,provider_transaction_id"
          )
          .single();

      if (subscriptionError) {
        console.error(
          "ERRO_ATUALIZAR_ASSINATURA:",
          subscriptionError.message
        );

        return json(
          {
            ok: false,
            error: "Não foi possível atualizar a assinatura",
          },
          500
        );
      }

      console.log("ASSINATURA_ATUALIZADA");

      return json({ ok: true });
    }

    if (action === "remove_subscription") {
      const userId = String(body?.user_id || "").trim();

      if (!userId) {
        return json(
          {
            ok: false,
            error: "user_id não informado",
          },
          400
        );
      }

      const now = new Date().toISOString();

      const { data: subscription, error: subscriptionError } =
        await adminClient
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan: "free",
              status: "active",
              started_at: now,
              expires_at: null,
              provider: "manual",
              provider_transaction_id: null,
              updated_at: now,
            },
            {
              onConflict: "user_id",
            }
          )
          .select(
            "user_id,plan,status,started_at,expires_at,provider,provider_transaction_id"
          )
          .single();

      if (subscriptionError) {
        console.error(
          "ERRO_REMOVER_ASSINATURA:",
          subscriptionError.message
        );

        return json(
          {
            ok: false,
            error: "Não foi possível remover a assinatura",
          },
          500
        );
      }

      console.log("ASSINATURA_REMOVIDA");

      return json({ ok: true });
    }

    return json(
      {
        ok: false,
        error: "Ação desconhecida",
      },
      400
    );

  } catch (error) {
    console.error("ERRO_FUNCTION:", error);

    return json(
      {
        ok: false,
        error: "Erro interno",
      },
      500
    );
  }
});