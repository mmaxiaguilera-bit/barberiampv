// Mail de aviso de turno cancelado.
// Seguridad (auditoría 2026-11-05): solo manda si el turno está realmente cancelado,
// fue cancelado en los últimos 15 minutos y todavía no se avisó (una única vez).
// Acepta appointment_id (personal) o cancel_token (cliente desde /mi-turno).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, esc, isUuid, json, mailConfigured, sendMail, SITE_URL } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);

  try {
    const { appointment_id, cancel_token } = await req.json().catch(() => ({}));
    if (!isUuid(appointment_id) && !isUuid(cancel_token)) {
      return json(req, { error: "appointment_id o cancel_token requerido" }, 400);
    }

    if (!mailConfigured()) return json(req, { ok: true, skipped: "no_mail_config" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    let q = admin.from("appointments")
      .update({ cancellation_sent_at: new Date().toISOString() })
      .eq("status", "cancelado")
      .is("cancellation_sent_at", null)
      .gte("updated_at", since);
    q = isUuid(appointment_id) ? q.eq("id", appointment_id) : q.eq("cancel_token", cancel_token);
    const { data: appt } = await q
      .select("id, client_name, client_email, service_name, appointment_date, appointment_time, clients(email, first_name), barbers(name)")
      .maybeSingle();
    if (!appt) return json(req, { ok: true, skipped: "not_eligible" });

    const a = appt as any;
    const to: string | null = a.client_email ?? a.clients?.email ?? null;
    if (!to) return json(req, { ok: true, skipped: "no_email" });

    const clientName = a.clients?.first_name ?? String(a.client_name ?? "").split(" ")[0] ?? "";
    const dateStr = new Date(a.appointment_date + "T12:00:00").toLocaleDateString("es-AR", {
      weekday: "long", day: "numeric", month: "long",
    });
    const timeStr = String(a.appointment_time ?? "").slice(0, 5);

    const html = `
<!DOCTYPE html>
<html>
<body style="background:#0a0a0a;color:#e5e0d8;font-family:Georgia,serif;margin:0;padding:40px 20px">
<div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1a1500,#0a0a0a);padding:32px;text-align:center;border-bottom:1px solid #2a2a2a">
    <div style="color:#c9a84c;font-size:26px;letter-spacing:3px;text-transform:uppercase">MVP Barber</div>
    <div style="color:#666;font-size:11px;letter-spacing:4px;margin-top:4px">PREMIUM BARBER STUDIO</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#e5e0d8;font-weight:400;margin:0 0 16px">Hola, ${esc(clientName)}</h2>
    <p style="color:#999;line-height:1.6;margin:0 0 24px">
      Te informamos que tu turno fue <strong style="color:#e74c3c">cancelado</strong>.
    </p>
    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:0 0 24px">
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="color:#666;padding:5px 0">Servicio</td><td style="color:#e5e0d8;text-align:right">${esc(a.service_name)}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Barbero</td><td style="color:#e5e0d8;text-align:right">${esc(a.barbers?.name ?? "—")}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Fecha</td><td style="color:#e5e0d8;text-align:right;text-transform:capitalize">${esc(dateStr)}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Hora</td><td style="color:#e5e0d8;text-align:right">${esc(timeStr)}</td></tr>
      </table>
    </div>
    <p style="color:#999;font-size:14px;line-height:1.6">
      Si necesitás reagendar, podés hacerlo desde nuestra página cuando quieras.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${esc(SITE_URL)}" style="background:linear-gradient(135deg,#c9a84c,#a07830);color:#000;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:1px;display:inline-block">
        Reservar nuevo turno
      </a>
    </div>
  </div>
  <div style="padding:20px;text-align:center;border-top:1px solid #1a1a1a">
    <p style="color:#444;font-size:11px;margin:0">© ${new Date().getFullYear()} MVP Barber · Rada Tilly, Chubut</p>
  </div>
</div>
</body>
</html>`.trim();

    try {
    await sendMail(to, "Tu turno fue cancelado — Barbería MVP", html);
    } catch (err) {
      // El mail no salió: se libera la marca para poder reintentar
      await admin.from("appointments").update({ cancellation_sent_at: null }).eq("id", a.id);
      throw err;
    }

    return json(req, { ok: true });
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error interno" }, 500);
  }
});
