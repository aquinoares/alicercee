import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, security-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

/*
 * Calcula a data de expiração da assinatura.
 */
function getExpirationDate(payload: any, event: string) {
  const nextCharge =
    payload?.subscription?.next_charge_date ||
    payload?.plan?.next_charge_date ||
    payload?.next_charge_date;

  if (nextCharge) {
    const date = new Date(nextCharge);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  /*
   * Fallback caso a Kirvano não envie next_charge_date.
   */
  const frequency =
    String(
      payload?.plan?.charge_frequency ||
      payload?.subscription?.charge_frequency ||
      ""
    ).toLowerCase();

  const now = new Date();

  /*
   * Plano anual.
   */
  if (
    frequency.includes("year") ||
    frequency.includes("annual") ||
    frequency.includes("anual") ||
    frequency.includes("12")
  ) {
    now.setFullYear(now.getFullYear() + 1);
    return now.toISOString();
  }

  /*
   * Plano mensal.
   */
  if (
    frequency.includes("month") ||
    frequency.includes("monthly") ||
    frequency.includes("mensal")
  ) {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }

  /*
   * Cancelamento ou expiração sem data válida.
   */
  if (
    event === "SUBSCRIPTION_CANCELED" ||
    event === "SUBSCRIPTION_EXPIRED"
  ) {
    return null;
  }

  return null;
}

/*
 * Obtém o ID da transação enviado pela Kirvano.
 */
function getTransactionId(payload: any) {
  return (
    payload?.sale_id ||
    payload?.transaction_id ||
    payload?.id ||
    payload?.subscription?.id ||
    null
  );
}

Deno.serve(async (req) => {
  /*
   * CORS.
   */
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    /*
     * Só aceitamos POST.
     */
    if (req.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed",
        },
        405
      );
    }

    /*
     * TOKEN DO WEBHOOK KIRVANO
     *
     * A Kirvano envia o token no header:
     * security-token
     */
    const webhookToken =
      Deno.env.get("KIRVANO_WEBHOOK_TOKEN");

    const incomingToken =
      req.headers.get("security-token");

    if (!webhookToken) {
      console.error(
        "KIRVANO_WEBHOOK_TOKEN_NAO_CONFIGURADO"
      );

      return json(
        {
          ok: false,
          error: "Webhook token não configurado",
        },
        500
      );
    }

    if (
      !incomingToken ||
      incomingToken !== webhookToken
    ) {
      console.warn(
        "KIRVANO_TOKEN_INVALIDO"
      );

      return json(
        {
          ok: false,
          error: "Unauthorized",
        },
        401
      );
    }

    /*
     * Lê o payload enviado pela Kirvano.
     */
    const payload = await req.json();

    console.log(
      "KIRVANO_WEBHOOK_RECEBIDO:",
      JSON.stringify(payload)
    );

    /*
     * Identifica o evento.
     */
    const event = String(
      payload?.event || ""
    )
      .trim()
      .toUpperCase();

    console.log("KIRVANO_EVENTO:", event);

   console.log(
      "KIRVANO_PRODUTOS:",
      JSON.stringify(payload?.products || [])
   );

    /*
     * Carrinho abandonado não altera assinatura.
     */
    if (event === "ABANDONED_CART") {
      console.log(
        "KIRVANO_EVENTO_IGNORADO:",
        event
      );

      return json({
        ok: true,
        ignored: true,
        event,
        reason: "Carrinho abandonado",
      });
    }

    /*
     * Obtém o e-mail do cliente.
     */
    const email = String(
      payload?.customer?.email ||
      payload?.customer?.email_address ||
      ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      console.error(
        "WEBHOOK_SEM_EMAIL"
      );

      return json(
        {
          ok: false,
          error: "Customer email not found",
        },
        400
      );
    }

    /*
     * Configuração do Supabase.
     */
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      console.error(
        "SUPABASE_ENV_NAO_ENCONTRADO"
      );

      return json(
        {
          ok: false,
          error:
            "Supabase environment not configured",
        },
        500
      );
    }

    /*
     * Cliente administrativo do Supabase.
     */
    const supabaseAdmin =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /*
     * Procura o usuário pelo e-mail.
     */
    const {
      data: usersData,
      error: usersError,
    } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      console.error(
        "ERRO_LISTAR_USUARIOS:",
        usersError.message
      );

      return json(
        {
          ok: false,
          error:
            "Could not search users",
        },
        500
      );
    }

    const user =
      usersData.users.find(
        (u) =>
          String(u.email || "")
            .trim()
            .toLowerCase() === email
      );

    /*
     * Não criamos conta automaticamente.
     */
    if (!user) {
      console.warn(
        "USUARIO_NAO_ENCONTRADO:",
        email
      );

      return json({
        ok: true,
        found: false,
        pending: true,
        email,
        event,
        message:
          "Pagamento recebido, mas não existe uma conta Alicerce com este e-mail.",
      });
    }

    console.log(
      "USUARIO_ENCONTRADO:",
      user.id,
      user.email
    );

    /*
     * ID da transação.
     */
    const transactionId =
      getTransactionId(payload);

    /*
     * =====================================================
     * COMPRA APROVADA
     * =====================================================
     */
    if (
      event === "SALE_APPROVED" ||
      event === "SALE_COMPLETED" ||
      event === "PURCHASE_APPROVED"
    ) {
      const expiresAt =
        getExpirationDate(
          payload,
          event
        );

      const now =
        new Date().toISOString();

      const {
        data: subscription,
        error,
      } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: user.id,
              plan: "pro",
              status: "active",
              started_at: now,
              expires_at: expiresAt,
              provider: "kirvano",
              provider_transaction_id:
                transactionId,
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

      if (error) {
        console.error(
          "ERRO_ATUALIZAR_ASSINATURA:",
          error.message
        );

        return json(
          {
            ok: false,
            error:
              "Could not update subscription",
          },
          500
        );
      }

      console.log(
        "ASSINATURA_LIBERADA:",
        JSON.stringify(subscription)
      );

      return json({
        ok: true,
        action:
          "subscription_activated",
        event,
        user_id: user.id,
        subscription,
      });
    }

    /*
     * =====================================================
     * RENOVAÇÃO
     * =====================================================
     */
    if (
      event === "SUBSCRIPTION_RENEWED" ||
      event ===
        "SUBSCRIPTION_PAYMENT_APPROVED"
    ) {
      const expiresAt =
        getExpirationDate(
          payload,
          event
        );

      const now =
        new Date().toISOString();

      const {
        data: subscription,
        error,
      } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: user.id,
              plan: "pro",
              status: "active",
              expires_at: expiresAt,
              provider: "kirvano",
              provider_transaction_id:
                transactionId,
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

      if (error) {
        console.error(
          "ERRO_RENOVAR_ASSINATURA:",
          error.message
        );

        return json(
          {
            ok: false,
            error:
              "Could not renew subscription",
          },
          500
        );
      }

      console.log(
        "ASSINATURA_RENOVADA:",
        JSON.stringify(subscription)
      );

      return json({
        ok: true,
        action:
          "subscription_renewed",
        event,
        user_id: user.id,
        subscription,
      });
    }

    /*
     * =====================================================
     * CANCELAMENTO
     * =====================================================
     *
     * O cancelamento não remove imediatamente
     * o acesso.
     *
     * O usuário continua com acesso até
     * expires_at.
     */
    if (
      event ===
      "SUBSCRIPTION_CANCELED"
    ) {
      const expiresAt =
        getExpirationDate(
          payload,
          event
        );

      const now =
        new Date().toISOString();

      const {
        data: subscription,
        error,
      } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: user.id,
              plan: "pro",
              status: "active",
              expires_at: expiresAt,
              provider: "kirvano",
              provider_transaction_id:
                transactionId,
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

      if (error) {
        console.error(
          "ERRO_CANCELAR_ASSINATURA:",
          error.message
        );

        return json(
          {
            ok: false,
            error:
              "Could not cancel subscription",
          },
          500
        );
      }

      console.log(
        "ASSINATURA_CANCELADA:",
        JSON.stringify(subscription)
      );

      return json({
        ok: true,
        action:
          "subscription_canceled",
        event,
        user_id: user.id,
        subscription,
      });
    }

    /*
     * =====================================================
     * REEMBOLSO / CHARGEBACK
     * =====================================================
     *
     * Aqui o acesso PRO é revogado imediatamente.
     */
    if (
      event === "SALE_REFUNDED" ||
      event === "SALE_CHARGEBACK"
    ) {
      const now =
        new Date().toISOString();

      const {
        data: subscription,
        error,
      } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: user.id,
              plan: "free",
              status: "active",
              started_at: now,
              expires_at: null,
              provider: "kirvano",
              provider_transaction_id:
                transactionId,
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

      if (error) {
        console.error(
          "ERRO_REVOGAR_ASSINATURA:",
          error.message
        );

        return json(
          {
            ok: false,
            error:
              "Could not revoke subscription",
          },
          500
        );
      }

      console.log(
        event === "SALE_REFUNDED"
          ? "ACESSO_REVOGADO_REEMBOLSO:"
          : "ACESSO_REVOGADO_CHARGEBACK:",
        JSON.stringify(subscription)
      );

      return json({
        ok: true,
        action:
          event === "SALE_REFUNDED"
            ? "subscription_refunded"
            : "subscription_chargeback",
        event,
        user_id: user.id,
        subscription,
      });
    }

    /*
     * =====================================================
     * ASSINATURA EXPIRADA
     * =====================================================
     */
    if (
      event ===
      "SUBSCRIPTION_EXPIRED"
    ) {
      const now =
        new Date().toISOString();

      const {
        data: subscription,
        error,
      } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: user.id,
              plan: "free",
              status: "active",
              started_at: now,
              expires_at: null,
              provider: "kirvano",
              provider_transaction_id:
                transactionId,
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

      if (error) {
        console.error(
          "ERRO_EXPIRAR_ASSINATURA:",
          error.message
        );

        return json(
          {
            ok: false,
            error:
              "Could not expire subscription",
          },
          500
        );
      }

      console.log(
        "ASSINATURA_EXPIRADA:",
        JSON.stringify(subscription)
      );

      return json({
        ok: true,
        action:
          "subscription_expired",
        event,
        user_id: user.id,
        subscription,
      });
    }

    /*
     * =====================================================
     * EVENTO NÃO TRATADO
     * =====================================================
     */
    console.log(
      "EVENTO_NAO_TRATADO:",
      event
    );

    return json({
      ok: true,
      ignored: true,
      event,
      message:
        "Evento recebido, mas não altera a assinatura.",
    });

  } catch (error) {
    console.error(
      "ERRO_WEBHOOK:",
      error
    );

    return json(
      {
        ok: false,
        error: "Invalid webhook",
      },
      400
    );
  }
});