// Turnos reservados desde este dispositivo. Se guarda solo el token del turno
// (sin datos personales) para poder verlo y cancelarlo desde "Mi turno".
// El link del mail de confirmación (/mi-turno?t=<token>) funciona desde cualquier dispositivo.

const KEY = "mvp.my-bookings.v1";
const MAX = 20;

type Stored = { token: string; date: string };

const read = (): Stored[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Stored[]) : [];
    return Array.isArray(list) ? list.filter(x => typeof x?.token === "string") : [];
  } catch {
    return [];
  }
};

const write = (list: Stored[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* modo privado */ }
};

/** Guarda un turno recién reservado y descarta los que ya pasaron. */
export const rememberBooking = (token: string, date: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const list = read().filter(x => x.token !== token && x.date >= today);
  write([...list, { token, date }]);
};

export const rememberedTokens = (): string[] => read().map(x => x.token);

export const forgetBooking = (token: string) => write(read().filter(x => x.token !== token));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isToken = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);
