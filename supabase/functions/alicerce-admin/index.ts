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
    },
  });
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
            "plan,status,started_at,expires_at,provider,provider_transaction_id"
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