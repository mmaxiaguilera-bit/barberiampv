// Carga fotos de EJEMPLO (no son cortes reales) en el portfolio de Juan (demo),
// entrando como el barbero, y verifica los permisos del almacenamiento.
// Solo para la base de pruebas. Uso: npm run db:photos:dev
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEV_REF = "oxapiokwxziphfpktnah";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.VITE_SUPABASE_URL?.includes(DEV_REF)) {
  console.error(`ABORTADO: ${env.VITE_SUPABASE_URL} no es el proyecto de pruebas.`);
  process.exit(1);
}

const JUAN = "00000000-0000-4000-b000-000000000001";
const PEDRO = "00000000-0000-4000-b000-000000000002";
const CAPTIONS = ["Fade clásico", "Degradé bajo", "Texturizado", "Pompadour", "Barba perfilada", "Buzz cut"];
const photo = (i) => readFileSync(new URL(`../supabase/dev/photos/ejemplo-${i}.jpg`, import.meta.url));
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} | ${name} | ${detail}`); };

const barber = client();
const { error: loginErr } = await barber.auth.signInWithPassword({ email: "barbero@mvp.test", password: "MvpDemo2026!" });
if (loginErr) throw loginErr;

for (const [i, caption] of CAPTIONS.entries()) {
  const path = `${JUAN}/ejemplo-${i + 1}.jpg`;
  const up = await barber.storage.from("barber-portfolio").upload(path, photo(i + 1), { contentType: "image/jpeg", upsert: true });
  if (up.error) throw up.error;
  const row = await barber.from("barber_portfolio").upsert({ barber_id: JUAN, image_path: path, caption, display_order: i }, { onConflict: "image_path" });
  if (row.error) throw row.error;
}
check("barbero sube fotos a su portfolio", true, `${CAPTIONS.length} fotos`);

const toPedro = await barber.storage.from("barber-portfolio").upload(`${PEDRO}/intruso.jpg`, photo(1), { contentType: "image/jpeg" });
check("barbero no sube a la carpeta de otro", !!toPedro.error, toPedro.error?.message);
const rowPedro = await barber.from("barber_portfolio").insert({ barber_id: PEDRO, image_path: `${PEDRO}/x.jpg` });
check("barbero no registra fotos de otro", !!rowPedro.error, rowPedro.error?.message);

const base = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/barber-portfolio`;
const otherFolder = await barber.rpc("set_my_barber_photo", { _photo_url: `${base}/${PEDRO}/profile.jpg` });
check("barbero no usa una foto de la carpeta de otro como perfil", otherFolder.error?.message === "invalid_photo", otherFolder.error?.message);
const external = await barber.rpc("set_my_barber_photo", { _photo_url: "https://ejemplo.com/foto.jpg" });
check("barbero no usa una URL externa como perfil", external.error?.message === "invalid_photo", external.error?.message);

const admin = client();
await admin.auth.signInWithPassword({ email: "admin@mvp.test", password: "MvpDemo2026!" });
const adminUp = await admin.storage.from("barber-portfolio").upload(`${JUAN}/admin.jpg`, photo(1), { contentType: "image/jpeg" });
check("admin no sube fotos (las sube cada barbero)", !!adminUp.error, adminUp.error?.message);
const adminPhoto = await admin.rpc("set_my_barber_photo", { _photo_url: null });
check("admin no cambia la foto de perfil de un barbero", adminPhoto.error?.message === "forbidden", adminPhoto.error?.message);

const anon = client();
const anonUp = await anon.storage.from("barber-portfolio").upload(`${JUAN}/anon.jpg`, photo(1), { contentType: "image/jpeg" });
check("anónimo no sube fotos", !!anonUp.error, anonUp.error?.message);
const anonDel = await anon.from("barber_portfolio").delete().eq("barber_id", JUAN).select();
check("anónimo no borra fotos", (anonDel.data ?? []).length === 0);
const anonPhoto = await anon.rpc("set_my_barber_photo", { _photo_url: null });
check("anónimo no cambia fotos de perfil", !!anonPhoto.error, anonPhoto.error?.message);
const pub = await anon.from("barber_portfolio").select("id").eq("barber_id", JUAN);
check("anónimo ve las fotos públicas", pub.data?.length === CAPTIONS.length, `${pub.data?.length} fotos`);

process.exit(failures ? 1 : 0);
