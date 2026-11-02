// Prueba de concurrencia real contra la base de PRUEBAS: dispara pedidos en
// paralelo (cada uno es una transacción distinta) y verifica que nada se duplique.
// Uso: npm run test:concurrency:dev   (después: npm run db:reset:dev)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEV_REF = "oxapiokwxziphfpktnah";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
if (!url?.includes(DEV_REF)) {
  console.error(`ABORTADO: ${url} no es el proyecto de pruebas.`);
  process.exit(1);
}

const PASSWORD = "MvpDemo2026!";
const SOFIA = "00000000-0000-4000-d000-000000000001";
const MARTIN = "00000000-0000-4000-d000-000000000002";
const LUCAS = "00000000-0000-4000-d000-000000000003";
const JUAN = "00000000-0000-4000-b000-000000000001";
const N = 8;

const login = async (email) => {
  const c = createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};

let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"} | ${name} | ${detail}`);
};
const times = (fn) => Promise.all(Array.from({ length: N }, fn));

const barber = await login("barbero@mvp.test");
const admin = await login("admin@mvp.test");

const totalVisits = async (clientId) =>
  (await admin.from("loyalty_accounts").select("total_visits").eq("client_id", clientId).single()).data.total_visits;
const today = new Date().toLocaleDateString("en-CA");
// Turno de "hoy" del seed (el único confirmado del cliente; evita depender de la zona horaria)
const todayAppt = async (clientId) =>
  (await admin.from("appointments").select("id").eq("client_id", clientId).eq("status", "confirmado").single()).data.id;

// 1. N "Cobrar y marcar atendido" simultáneos sobre el mismo turno
{
  const before = await totalVisits(SOFIA);
  const appt = await todayAppt(SOFIA);
  await times(() => barber.from("appointments").update({ status: "atendido" }).eq("id", appt));
  const { count } = await admin.from("loyalty_visits").select("id", { count: "exact", head: true })
    .eq("appointment_id", appt).is("reversed_at", null);
  const after = await totalVisits(SOFIA);
  check(`${N} marcados simultáneos suman 1 visita`, count === 1 && after === before + 1, `visitas activas ${count}, total ${before}→${after}`);
}

// 2. N canjes simultáneos del mismo premio
{
  const { data: reward } = await admin.from("loyalty_rewards").select("id")
    .eq("client_id", MARTIN).eq("status", "available").limit(1).single();
  const results = await times(() => barber.rpc("redeem_reward", { _reward_id: reward.id }));
  const ok = results.filter((r) => !r.error).length;
  const rejected = results.filter((r) => r.error?.message === "reward_not_available").length;
  check(`${N} canjes simultáneos: 1 aceptado`, ok === 1 && rejected === N - 1, `aceptados ${ok}, rechazados ${rejected}`);
}

// 3. N reintentos simultáneos del mismo walk-in
{
  const before = await totalVisits(LUCAS).catch(() => 0);
  const paymentId = crypto.randomUUID();
  const results = await times(() => barber.rpc("staff_register_walk_in", {
    _payment_id: paymentId, _client_id: LUCAS, _barber_id: JUAN, _service_name: "Corte",
    _amount: 12000, _tip: 0, _method: "efectivo", _payment_date: today,
  }));
  const errors = results.filter((r) => r.error).map((r) => r.error.message);
  const { count: payments } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("id", paymentId);
  const after = await totalVisits(LUCAS);
  check(`${N} walk-ins con el mismo id: 1 cobro y 1 visita`, payments === 1 && after === before + 1 && errors.length === 0,
    `cobros ${payments}, total ${before}→${after}, errores ${errors.length ? errors.join(", ") : 0}`);
}

// 4. N reversiones simultáneas de la misma visita
{
  const before = await totalVisits(SOFIA);
  const { data: visit } = await admin.from("loyalty_visits").select("id")
    .eq("client_id", SOFIA).is("reversed_at", null).order("credited_at", { ascending: false }).limit(1).single();
  const results = await times(() => admin.rpc("admin_reverse_visit", { _visit_id: visit.id, _reason: "Prueba de concurrencia" }));
  const reversed = results.filter((r) => r.data === true).length;
  const after = await totalVisits(SOFIA);
  check(`${N} reversiones simultáneas: descuenta 1`, reversed === 1 && after === before - 1, `aplicadas ${reversed}, total ${before}→${after}`);
}

// 5. Visitas simultáneas distintas del mismo cliente: no se pierde ninguna
{
  const before = await totalVisits(MARTIN);
  await times((_, i) => admin.rpc("admin_add_manual_visit", { _client_id: MARTIN, _visit_date: today, _reason: `Concurrencia ${i}` }));
  const after = await totalVisits(MARTIN);
  check(`${N} visitas distintas simultáneas suman ${N}`, after === before + N, `total ${before}→${after}`);
}

console.log(`\n${failures ? "HAY FALLAS" : "TODO OK"} (${failures} fallas)`);
process.exit(failures ? 1 : 0);
