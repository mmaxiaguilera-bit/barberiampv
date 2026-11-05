// Invita a un barbero por email. Solo admins.
// Seguridad (auditoría 2026-11-05): el rol se verifica en user_roles (antes leía
// profiles.role, que no existe, y la función respondía 403 siempre). CORS restringido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, SITE_URL } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "No autorizado" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return json(req, { error: "No autorizado" }, 401);

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) return json(req, { error: "Solo admins pueden invitar" }, 403);

    const { email, name } = await req.json().catch(() => ({}));
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail) || cleanEmail.length > 254) {
      return json(req, { error: "Email inválido" }, 400);
    }
    const cleanName = typeof name === "string" ? name.trim().slice(0, 80) : "";

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
      redirectTo: `${SITE_URL}/panel`,
      data: { full_name: cleanName },
    });
    if (error) return json(req, { error: error.message }, 400);

    return json(req, { ok: true });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error interno" }, 500);
  }
});
