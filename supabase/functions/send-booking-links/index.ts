// "Reenviame el link": manda a un email los links personales de sus próximos turnos.
// Solo el dueño de la casilla los recibe, así que sirve como verificación.
// La respuesta es siempre la misma (no revela si ese email tiene turnos).
// Límites: 3 pedidos por email por hora y 60 pedidos en total por hora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, esc, json, mailConfigured, sendMail, SITE_URL } from "../_shared/http.ts";

const PER_EMAIL_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 60;
const GENERIC = { ok: true, message: "Si tenés turnos próximos con ese email, te mandamos los links." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);

  try {
    const { email } = await req.json().catch(() => ({}));
    const to = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (to.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return json(req, { error: "Email inválido" }, 400);
    }
    if (!mailConfigured()) return json(req, GENERIC);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const [{ count: perEmail }, { count: total }] = await Promise.all([
      admin.from("booking_link_requests").select("id", { count: "exact", head: true })
        .eq("email", to).gte("created_at", hourAgo),
      admin.from("booking_link_requests").select("id", { count: "exact", head: true })
        .gte("created_at", hourAgo),
    ]);
    if ((perEmail ?? 0) >= PER_EMAIL_PER_HOUR || (total ?? 0) >= GLOBAL_PER_HOUR) return json(req, GENERIC);
    await admin.from("booking_link_requests").insert({ email: to });

    // Próximos turnos activos con ese email: el de la reserva o, en turnos viejos, el de la ficha
    const today = new Date(Date.now() - 3 * 60 * 60_000).toISOString().slice(0, 10); // fecha en Argentina (UTC-3)
    const fields = "appointment_date, appointment_time, service_name, cancel_token, client_email, barbers(name), clients(email)";
    const [{ data: byBooking }, { data: byClient }] = await Promise.all([
      admin.from("appointments").select(fields)
        .eq("client_email", to).in("status", ["pendiente", "confirmado"]).gte("appointment_date", today),
      admin.from("appointments").select(fields.replace("clients(email)", "clients!inner(email)"))
        .is("client_email", null).eq("clients.email", to).in("status", ["pendiente", "confirmado"]).gte("appointment_date", today),
    ]);
    const appts = [...(byBooking ?? []), ...(byClient ?? [])] as any[];
    if (appts.length === 0) return json(req, GENERIC);
    appts.sort((a, b) => `${a.appointment_date}${a.appointment_time}`.localeCompare(`${b.appointment_date}${b.appointment_time}`));

    const rows = appts.slice(0, 10).map((a) => {
      const dateStr = new Date(a.appointment_date + "T12:00:00").toLocaleDateString("es-AR", {
        weekday: "long", day: "numeric", month: "long",
      });
      const link = `${SITE_URL}/mi-turno?t=${encodeURIComponent(a.cancel_token)}`;
      return `
      <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:0 0 12px">
        <div style="color:#e5e0d8;font-size:15px;text-transform:capitalize">${esc(dateStr)} · ${esc(String(a.appointment_time).slice(0, 5))}</div>
        <div style="color:#999;font-size:13px;margin:4px 0 12px">${esc(a.service_name)} con ${esc(a.barbers?.name ?? "—")}</div>
        <a href="${esc(link)}" style="color:#c9a84c;font-size:14px;font-weight:600;text-decoration:none">Ver o cancelar este turno →</a>
      </div>`;
    }).join("");

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
    <h2 style="color:#e5e0d8;font-weight:400;margin:0 0 16px">Tus próximos turnos</h2>
    <p style="color:#999;line-height:1.6;margin:0 0 24px">
      Pediste los links para ver o cancelar tus turnos. Podés cancelar online hasta 3 horas antes.
      Si no fuiste vos, ignorá este mail.
    </p>
    ${rows}
  </div>
  <div style="padding:20px;text-align:center;border-top:1px solid #1a1a1a">
    <p style="color:#444;font-size:11px;margin:0">© ${new Date().getFullYear()} MVP Barber · Rada Tilly, Chubut</p>
  </div>
</div>
</body>
</html>`.trim();

    await sendMail(to, "Tus turnos — Barbería MVP", html);
    return json(req, GENERIC);
  } catch (e) {
    console.error(e);
    return json(req, { error: "Error interno" }, 500);
  }
});
