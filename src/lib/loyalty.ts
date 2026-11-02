// Fidelización: constantes y helpers puros (sin Supabase) para la tarjeta,
// el panel del negocio y la exportación de contactos.

// Debe coincidir con una fila de public.marketing_consent_texts.
// Si cambia el texto, agregar una versión nueva en una migración.
export const CONSENT_VERSION = "v1-2026-10";
export const CONSENT_TEXT = "Quiero recibir novedades, promociones y beneficios por email";
export const WHATSAPP_CONSENT_VERSION = "wa-v1-2026-10";
export const WHATSAPP_CONSENT_TEXT = "Quiero recibir por WhatsApp avisos de mi tarjeta y promociones";

// ----- WhatsApp -----
// Deja dígitos y un "+" inicial (mismo criterio que public.normalize_whatsapp)
export const normalizeWhatsapp = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? (raw.trim().startsWith("+") ? "+" : "") + digits : "";
};
export const isValidWhatsapp = (raw: string) => /^\+?\d{10,15}$/.test(normalizeWhatsapp(raw));

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ----- Lanzamiento -----
// Debe coincidir con public.loyalty_settings.starts_on (las visitas anteriores no suman)
// La fecha de inicio se configura en Admin → Tarjeta (loyalty_settings.starts_on)
export const loyaltyNotStarted = (startsOn: string, today = new Date().toLocaleDateString("en-CA")) => today < startsOn;
export const formatStartLabel = (startsOn: string) =>
  new Date(startsOn + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

const INVITE_DISMISSED_KEY = "mvp_loyalty_invite_dismissed";
const PENDING_SIGNUP_KEY = "mvp_loyalty_pending_signup";

export interface LoyaltyProgress {
  stamps: number;     // sellos a dibujar en la tarjeta
  remaining: number;  // visitas que faltan para el próximo premio
  percent: number;
  owed: number;       // visitas a compensar (ciclo negativo)
}

export const loyaltyProgress = (cycleVisits: number, visitsRequired: number): LoyaltyProgress => {
  const required = Math.max(1, visitsRequired);
  if (cycleVisits >= required) {
    // La regla bajó por debajo del ciclo actual: el premio se genera en la próxima visita
    return { stamps: required, remaining: 1, percent: 100, owed: 0 };
  }
  const stamps = Math.max(0, cycleVisits);
  return {
    stamps,
    remaining: required - cycleVisits,
    percent: Math.round((stamps / required) * 100),
    owed: cycleVisits < 0 ? -cycleVisits : 0,
  };
};

const daysInMonth = (month: number) => ([4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 29 : 31);

export const isValidBirthday = (day: number | null, month: number | null, year: number | null = null) => {
  if (day == null && month == null) return year == null;
  if (day == null || month == null) return false;
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month))) return false;
  if (year == null) return true;
  const d = new Date(year, month - 1, day);
  return year >= 1900 && d.getMonth() === month - 1 && d <= new Date();
};

// Menor de 18 con fecha completa (sin año no se puede saber)
export const isMinor = (day: number | null, month: number | null, year: number | null, today = new Date()) => {
  if (day == null || month == null || year == null) return false;
  const eighteen = new Date(year + 18, month - 1, day);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return eighteen > t;
};

export const MINOR_PROMO_NOTICE =
  "Sos menor de 18: tu tarjeta funciona igual, pero para recibir promociones necesitás la autorización de tu madre, padre o tutor. Consultá en la barbería.";

export const formatBirthday = (day: number | null | undefined, month: number | null | undefined, year?: number | null) =>
  day && month ? `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}${year ? `/${year}` : ""}` : "";

// ----- Consentimiento -----
export type ConsentChannel = "email" | "whatsapp";

// Último registro de un canal (seq desempata registros con la misma fecha)
export const latestConsent = <T extends { granted: boolean; created_at: string; channel?: string; seq?: number }>(
  rows: T[] | null | undefined, channel: ConsentChannel = "email",
): T | null => {
  const own = (rows ?? []).filter(r => (r.channel ?? "email") === channel);
  if (!own.length) return null;
  return [...own].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.created_at.localeCompare(a.created_at))[0];
};

// ----- CSV (protegido contra inyección de fórmulas en Excel / Sheets) -----
const FORMULA_START = /^[=+\-@\t\r]/;

export const csvCell = (value: unknown) => {
  let s = value == null ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const toCsv = <T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; label: string }[]) => {
  const header = columns.map(c => csvCell(c.label)).join(",");
  const body = rows.map(r => columns.map(c => csvCell(r[c.key])).join(","));
  return "﻿" + [header, ...body].join("\r\n");
};

export const downloadFile = (content: string, filename: string, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ----- Premios en el camino (loyalty_programs.milestones) -----
export interface Milestone { visits: number; reward: string }
export const parseMilestones = (raw: unknown): Milestone[] =>
  Array.isArray(raw)
    ? raw.filter((m): m is Milestone => !!m && typeof m.visits === "number" && typeof m.reward === "string")
        .sort((a, b) => a.visits - b.visits)
    : [];
// Solo las posiciones: el cliente ve un regalo sorpresa, no qué es
export const milestoneVisits = (raw: unknown) => parseMilestones(raw).map(m => m.visits);

// ----- Mensajes de error -----
const BACKEND_ERRORS: Record<string, string> = {
  forbidden: "No tenés permiso para hacer esto.",
  before_loyalty_start: "No se pueden sumar visitas anteriores a la fecha de inicio de la tarjeta.",
  loyalty_paused: "La tarjeta de fidelidad está pausada por el momento.",
  birthday_reward_required: "Escribí cuál es el beneficio de cumpleaños.",
  invalid_settings: "Revisá los datos de la configuración.",
  invalid_program: "Revisá la cantidad de visitas (1 a 100) y el premio.",
  invalid_milestones: "Revisá los premios en el camino: cada uno en una visita distinta, antes de la última, y con descripción.",
  card_exists: "Ese cliente ya tiene tarjeta.",
  contact_required: "Cargá al menos un teléfono o un email.",
  invalid_initial_visits: "Los sellos que ya tenía tienen que ser menos que las visitas del premio.",
  not_authenticated: "Tu sesión venció. Volvé a ingresar.",
  email_not_verified: "Primero tenés que verificar tu email.",
  no_loyalty_card: "Todavía no tenés tarjeta de fidelidad.",
  invalid_name: "Ingresá un nombre válido (2 a 50 letras).",
  invalid_whatsapp: "Ingresá un WhatsApp válido, con código de área (ej: +54 9 297 412 3456).",
  unknown_consent_version: "El texto de consentimiento cambió. Recargá la página.",
  terms_not_accepted: "Para crear la tarjeta tenés que aceptar las condiciones.",
  whatsapp_required_for_opt_in: "Para borrar tu WhatsApp, primero desactivá los mensajes por WhatsApp.",
  reward_not_available: "Este premio ya fue canjeado o anulado.",
  reward_not_found: "No encontramos ese premio.",
  reason_required: "Escribí el motivo de la corrección.",
  client_not_found: "No encontramos ese cliente.",
  visit_not_found: "No encontramos esa visita.",
  phone_exists: "Ya existe un cliente con ese teléfono.",
  invalid_payment: "Revisá el servicio y el monto.",
  both_verified: "No se pueden unir dos tarjetas verificadas con emails distintos.",
  same_client: "Elegí dos fichas distintas.",
  appointment_not_found: "No encontramos ese turno.",
  invalid_birthday: "Revisá la fecha de nacimiento (el año va junto con día y mes).",
  minor_marketing_not_allowed: "Los menores de 18 necesitan autorización de su madre, padre o tutor para recibir promociones.",
};

export const loyaltyErrorMessage = (error: { message?: string } | null | undefined) => {
  const msg = error?.message ?? "";
  return BACKEND_ERRORS[msg] ?? (msg || "Ocurrió un error. Intentá de nuevo.");
};

export const authErrorMessage = (error: { message?: string } | null | undefined) => {
  const msg = error?.message ?? "";
  if (/email address|invalid format/i.test(msg)) return "El email no es válido.";
  if (/expired|invalid/i.test(msg)) return "El código es incorrecto o venció. Pedí uno nuevo.";
  if (/signups not allowed|user not found/i.test(msg)) return "No encontramos una tarjeta con ese email. Creá una nueva.";
  const wait = msg.match(/after (\d+) seconds/i);
  if (wait) return `Esperá ${wait[1]} segundos antes de pedir otro código.`;
  if (/rate limit/i.test(msg)) return "Hubo demasiados intentos. Probá de nuevo en unos minutos.";
  return msg || "No pudimos enviar el código. Intentá de nuevo.";
};

// ----- Preferencias locales (pueden fallar en modo privado: nunca romper la página) -----
const safeGet = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignorar */ } };
const safeRemove = (key: string) => { try { localStorage.removeItem(key); } catch { /* ignorar */ } };

export const isInviteDismissed = () => safeGet(INVITE_DISMISSED_KEY) === "1";
export const dismissInvite = () => safeSet(INVITE_DISMISSED_KEY, "1");

// Datos del formulario de alta mientras el cliente verifica su email
export interface PendingSignup {
  email: string;
  first_name: string;
  whatsapp: string;
  birth_day: number | null;
  birth_month: number | null;
  birth_year?: number | null;
  marketing_opt_in: boolean;
  whatsapp_opt_in: boolean;
  accepted_terms: boolean;
}

// Se descartan a las 24 h: si no verificó el email, no quedan datos personales en el navegador
export const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
export const savePendingSignup = (p: PendingSignup) => safeSet(PENDING_SIGNUP_KEY, JSON.stringify({ ...p, saved_at: Date.now() }));
export const clearPendingSignup = () => safeRemove(PENDING_SIGNUP_KEY);
export const readPendingSignup = (now = Date.now()): PendingSignup | null => {
  const raw = safeGet(PENDING_SIGNUP_KEY);
  if (!raw) return null;
  try {
    const { saved_at, ...p } = JSON.parse(raw) as PendingSignup & { saved_at?: number };
    if (typeof saved_at !== "number" || now - saved_at > PENDING_SIGNUP_TTL_MS) { clearPendingSignup(); return null; }
    return p;
  } catch { return null; }
};

// El WhatsApp es opcional; solo hace falta para aceptar mensajes por ese canal
export const whatsappError = (raw: string, optIn: boolean): string | null => {
  if (!raw.trim()) return optIn ? "Para recibir mensajes por WhatsApp, ingresá tu número." : null;
  return isValidWhatsapp(raw) ? null : "Ingresá tu WhatsApp con código de área (ej: +54 9 297 412 3456).";
};
