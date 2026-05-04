import { SmtpClient } from "https://deno.land/x/denomailer@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_name, client_email, service_name, barber_name, appointment_date, appointment_time } = await req.json();

    if (!client_email) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn("SMTP env vars not configured, skipping email");
      return new Response(JSON.stringify({ ok: true, skipped: "no_smtp" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateStr = new Date(appointment_date + "T12:00:00").toLocaleDateString("es-AR", {
      weekday: "long", day: "numeric", month: "long",
    });
    const timeStr = (appointment_time as string)?.slice(0, 5) ?? "";

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
    <h2 style="color:#e5e0d8;font-weight:400;margin:0 0 16px">Hola, ${client_name}</h2>
    <p style="color:#999;line-height:1.6;margin:0 0 24px">
      Tu turno fue reservado con éxito. ¡Te esperamos!
    </p>
    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:0 0 24px">
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="color:#666;padding:5px 0">Servicio</td><td style="color:#e5e0d8;text-align:right">${service_name}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Barbero</td><td style="color:#e5e0d8;text-align:right">${barber_name}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Fecha</td><td style="color:#e5e0d8;text-align:right;text-transform:capitalize">${dateStr}</td></tr>
        <tr><td style="color:#666;padding:5px 0">Hora</td><td style="color:#e5e0d8;text-align:right">${timeStr}</td></tr>
      </table>
    </div>
    <p style="color:#999;font-size:14px;line-height:1.6">
      Recordá llegar 5 minutos antes. Si necesitás cancelar, podés hacerlo desde nuestra página hasta 3 horas antes del turno.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="https://barberiampv.com/mi-turno" style="background:linear-gradient(135deg,#c9a84c,#a07830);color:#000;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:1px;display:inline-block">
        Ver mi turno
      </a>
    </div>
  </div>
  <div style="padding:20px;text-align:center;border-top:1px solid #1a1a1a">
    <p style="color:#444;font-size:11px;margin:0">© ${new Date().getFullYear()} MVP Barber · Rada Tilly, Chubut</p>
  </div>
</div>
</body>
</html>`.trim();

    const smtp = new SmtpClient();
    await smtp.connectTLS({ hostname: smtpHost, port: 465, username: smtpUser, password: smtpPass });
    await smtp.send({
      from: `Barbería MVP <${smtpUser}>`,
      to: client_email,
      subject: "¡Tu turno está confirmado! — Barbería MVP",
      html,
    });
    await smtp.close();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Error interno", detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
