// Utilidades comunes de las edge functions: CORS restringido, respuestas JSON y escape de HTML.

const ALLOWED_ORIGINS = [
  "https://www.barberiampv.com",
  "https://barberiampv.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

export const corsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

export const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.barberiampv.com";

// Envío de mails. Prioridad:
//  1) API HTTP de Resend si existe el secret RESEND_API_KEY (MAIL_FROM opcional).
//  2) SMTP con los secrets SMTP_HOST / SMTP_USER / SMTP_PASS (puerto 465), con nodemailer
//     cargado recién al enviar: la librería anterior (denomailer) hacía fallar el
//     arranque de las funciones con BOOT_ERROR / 503.
const hasSmtp = () => !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));

export const mailConfigured = () => !!Deno.env.get("RESEND_API_KEY") || hasSmtp();

export const sendMail = async (to: string, subject: string, html: string) => {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM") ?? "Barbería MVP <noreply@avisos.barberiampv.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) throw new Error(`resend_${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const { default: nodemailer } = await import("npm:nodemailer@6.9.16");
  const user = Deno.env.get("SMTP_USER")!;
  const transport = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST")!,
    port: 465,
    secure: true,
    auth: { user, pass: Deno.env.get("SMTP_PASS")! },
  });
  await transport.sendMail({
    from: Deno.env.get("MAIL_FROM") ?? `Barbería MVP <${user}>`,
    to,
    subject,
    html,
  });
};
