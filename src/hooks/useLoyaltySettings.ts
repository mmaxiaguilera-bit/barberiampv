import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Configuración de la tarjeta que se edita en Admin → Tarjeta (tabla loyalty_settings, una fila)
export interface LoyaltySettings {
  enabled: boolean;
  startsOn: string; // YYYY-MM-DD
  birthdayEnabled: boolean;
  birthdayReward: string | null;
}

// Mientras carga (o si falla) se asume activa, para no esconder la tarjeta por un error de red
const DEFAULTS: LoyaltySettings = { enabled: true, startsOn: "2026-11-03", birthdayEnabled: false, birthdayReward: null };

let cache: LoyaltySettings | null = null;
let pending: Promise<LoyaltySettings> | null = null;
const listeners = new Set<(s: LoyaltySettings) => void>();

const fetchSettings = () => {
  pending ??= Promise.resolve(
    supabase.from("loyalty_settings").select("enabled, starts_on, birthday_enabled, birthday_reward").maybeSingle(),
  ).then(({ data }) => {
    cache = data
      ? { enabled: data.enabled, startsOn: data.starts_on, birthdayEnabled: data.birthday_enabled, birthdayReward: data.birthday_reward }
      : DEFAULTS;
    listeners.forEach(l => l(cache!));
    return cache;
  }).catch(() => DEFAULTS).finally(() => { pending = null; });
  return pending;
};

// Vuelve a leer la configuración (después de guardar en Admin)
export const refreshLoyaltySettings = () => { cache = null; return fetchSettings(); };

export const useLoyaltySettings = () => {
  const [settings, setSettings] = useState<LoyaltySettings | null>(cache);
  useEffect(() => {
    listeners.add(setSettings);
    if (!cache) fetchSettings(); else setSettings(cache);
    return () => { listeners.delete(setSettings); };
  }, []);
  return { settings: settings ?? DEFAULTS, loaded: settings !== null };
};
