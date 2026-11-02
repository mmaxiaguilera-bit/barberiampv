import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { PanelLayout } from "@/components/PanelLayout";
import { StampCard } from "@/components/loyalty/StampCard";
import { BirthdayPicker } from "@/components/loyalty/LoyaltyAccessForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { refreshLoyaltySettings } from "@/hooks/useLoyaltySettings";
import { cn } from "@/lib/utils";
import { formatStartLabel, isValidBirthday, loyaltyErrorMessage, parseMilestones } from "@/lib/loyalty";
import { BadgeCheck, CalendarDays, Check, CreditCard, Footprints, Hourglass, Gift, Loader2, Minus, Plus, Search, Store, Trash2, Trophy, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];
type Settings = Database["public"]["Tables"]["loyalty_settings"]["Row"];

// =====================================================================
// Admin → Tarjeta de fidelidad
// =====================================================================
const AdminLoyalty = () => {
  const [program, setProgram] = useState<Program | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle(),
      supabase.from("loyalty_settings").select("*").maybeSingle(),
    ]);
    setProgram(p.data);
    setSettings(s.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const reload = async () => { await load(); await refreshLoyaltySettings(); };
  // Números y premios se recargan cuando se canjea o se agrega una tarjeta
  const [statsKey, setStatsKey] = useState(0);
  const bump = () => setStatsKey(k => k + 1);

  return (
    <PanelLayout requireRole="admin">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-luxury text-primary">Fidelización</p>
        <h1 className="font-serif text-3xl sm:text-4xl">Tarjeta de fidelidad</h1>
      </div>

      {loading || !settings ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <StatusBar settings={settings} onSaved={reload} />
          <StatsStrip refreshKey={statsKey} />
          <Tabs defaultValue="config">
            <TabsList className="mb-5 h-auto flex-wrap justify-start">
              <TabsTrigger value="config" className="gap-2"><Gift className="h-4 w-4" /> Configuración</TabsTrigger>
              <TabsTrigger value="cards" className="gap-2"><Users className="h-4 w-4" /> Clientes con tarjeta</TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2"><Trophy className="h-4 w-4" /> Premios por canjear</TabsTrigger>
            </TabsList>
            <TabsContent value="config">
              <ConfigForm program={program} settings={settings} onSaved={reload} />
            </TabsContent>
            <TabsContent value="cards">
              <CardsTab program={program} onChanged={bump} />
            </TabsContent>
            <TabsContent value="rewards">
              <RewardsTab refreshKey={statsKey} onChanged={bump} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PanelLayout>
  );
};

export default AdminLoyalty;

const saveSettings = async (s: Settings, patch: Partial<Settings>) => {
  const next = { ...s, ...patch };
  const { error } = await supabase.rpc("admin_update_loyalty_settings", {
    _enabled: next.enabled, _starts_on: next.starts_on,
    _birthday_enabled: next.birthday_enabled, _birthday_reward: next.birthday_reward ?? "",
  });
  if (error) { toast.error(loyaltyErrorMessage(error)); return false; }
  return true;
};

// ----- Encendida / pausada -----
const StatusBar = ({ settings, onSaved }: { settings: Settings; onSaved: () => void }) => {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    const msg = on
      ? "¿Encender la tarjeta? Se vuelve a mostrar en la web y los turnos atendidos suman visitas."
      : "¿Pausar la tarjeta? Se oculta de la web, no se crean tarjetas nuevas y los turnos atendidos NO suman visitas mientras esté pausada. El progreso y los premios de cada cliente se conservan.";
    if (!confirm(msg)) return;
    setBusy(true);
    if (await saveSettings(settings, { enabled: on })) toast.success(on ? "Tarjeta encendida" : "Tarjeta pausada");
    setBusy(false);
    onSaved();
  };
  return (
    <div className={cn("luxury-card p-5 flex items-center justify-between gap-4", !settings.enabled && "border-amber-300/40")}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", settings.enabled ? "bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/60" : "bg-amber-300")} />
        <div className="min-w-0">
          <p className="font-medium">{settings.enabled ? "Tarjeta encendida" : "Tarjeta pausada"}</p>
          <p className="text-xs text-muted-foreground">
            {settings.enabled
              ? `Visible en la web. Suma visitas desde el ${formatStartLabel(settings.starts_on)}.`
              : "Oculta en la web. No suma visitas ni se crean tarjetas nuevas."}
          </p>
        </div>
      </div>
      <Switch checked={settings.enabled} onCheckedChange={toggle} disabled={busy} aria-label="Tarjeta encendida" />
    </div>
  );
};

// =====================================================================
// Configuración: un solo formulario con vista previa en vivo
// =====================================================================
interface MilestoneRow { key: number; visits: string; reward: string }
let rowKey = 0;

const Section = ({ icon: Icon, title, hint, children }: { icon: typeof Gift; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="p-5 sm:p-6 space-y-4">
    <div>
      <h2 className="font-serif text-xl flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> {title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
    {children}
  </section>
);

const ConfigForm = ({ program, settings, onSaved }: { program: Program | null; settings: Settings; onSaved: () => void }) => {
  const initial = useMemo(() => ({
    visits: String(program?.visits_required ?? 10),
    reward: program?.is_demo ? "" : program?.reward_description ?? "",
    milestones: parseMilestones(program?.milestones).map(m => ({ key: ++rowKey, visits: String(m.visits), reward: m.reward })),
    startsOn: settings.starts_on,
  }), [program, settings]);

  const [visits, setVisits] = useState(initial.visits);
  const [reward, setReward] = useState(initial.reward);
  const [milestones, setMilestones] = useState<MilestoneRow[]>(initial.milestones);
  const [startsOn, setStartsOn] = useState(initial.startsOn);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVisits(initial.visits); setReward(initial.reward); setMilestones(initial.milestones);
    setStartsOn(initial.startsOn);
  }, [initial]);

  const msKey = (rows: { visits: string; reward: string }[]) => JSON.stringify(rows.map(r => [r.visits.trim(), r.reward.trim()]));
  const programDirty = visits !== initial.visits || reward.trim() !== initial.reward || msKey(milestones) !== msKey(initial.milestones);
  const settingsDirty = startsOn !== initial.startsOn;
  const dirty = programDirty || settingsDirty;

  const n = Number(visits);
  const previewVisits = Number.isInteger(n) && n >= 1 && n <= 30 ? n : 10;
  const previewMilestones = milestones.map(m => Number(m.visits)).filter(v => Number.isInteger(v) && v >= 1 && v < previewVisits);

  const addMilestone = () => {
    const used = new Set(milestones.map(m => Number(m.visits)));
    let next = 3;
    while (used.has(next) && next < previewVisits - 1) next += 3;
    setMilestones([...milestones, { key: ++rowKey, visits: used.has(next) ? "" : String(Math.min(next, previewVisits - 1)), reward: "" }]);
  };
  const updateMilestone = (key: number, patch: Partial<MilestoneRow>) =>
    setMilestones(milestones.map(m => (m.key === key ? { ...m, ...patch } : m)));

  const save = async () => {
    if (programDirty) {
      if (!Number.isInteger(n) || n < 1 || n > 100) return toast.error("Las visitas del premio final tienen que ser entre 1 y 100.");
      if (reward.trim().length < 3) return toast.error("Describí el premio final.");
      const seen = new Set<number>();
      for (const m of milestones) {
        const v = Number(m.visits);
        if (!Number.isInteger(v) || v < 1 || v >= n) return toast.error(`Cada premio en el camino tiene que estar entre la visita 1 y la ${n - 1}.`);
        if (seen.has(v)) return toast.error(`Hay dos premios en la visita ${v}.`);
        if (m.reward.trim().length < 3) return toast.error(`Describí el premio de la visita ${v}.`);
        seen.add(v);
      }
    }
    if (!startsOn) return toast.error("Elegí la fecha de inicio.");
    if (programDirty && !confirm("¿Guardar los premios? Los premios que los clientes ya ganaron no cambian.")) return;

    setBusy(true);
    if (programDirty) {
      const { error } = await supabase.rpc("admin_update_loyalty_program", {
        _visits_required: n, _reward_description: reward.trim(),
        _milestones: milestones.map(m => ({ visits: Number(m.visits), reward: m.reward.trim() })),
      });
      if (error) { setBusy(false); return toast.error(loyaltyErrorMessage(error)); }
    }
    if (settingsDirty) {
      const ok = await saveSettings(settings, { starts_on: startsOn });
      if (!ok) { setBusy(false); return; }
    }
    setBusy(false);
    toast.success("Cambios guardados");
    onSaved();
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <div className="luxury-card divide-y divide-border overflow-hidden">
        <Section icon={Trophy} title="Premio final" hint="Al completar la tarjeta. El cliente lo ve en su tarjeta.">
          {program?.is_demo && (
            <p className="text-xs text-amber-300/90 border border-amber-300/30 rounded-md px-3 py-2 bg-amber-300/5">
              Todavía no definiste el premio: la tarjeta muestra "DEMO". Completalo y guardá.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Al completar</span>
            <Input type="number" min={1} max={100} value={visits} onChange={e => setVisits(e.target.value)} className="w-20 text-center" aria-label="Visitas del premio final" />
            <span className="text-muted-foreground">visitas, gana</span>
            <Input value={reward} onChange={e => setReward(e.target.value)} maxLength={200} placeholder="Ej: Corte gratis" className="flex-1 min-w-[12rem]" aria-label="Premio final" />
          </div>
        </Section>

        <Section icon={Gift} title="Premios en el camino" hint="Opcionales. En la tarjeta del cliente aparece un regalo sorpresa en ese círculo; recién cuando llega a esa visita ve qué ganó.">
          {milestones.length > 0 && (
            <ul className="space-y-2">
              {milestones.map(m => (
                <li key={m.key} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 pl-3 h-10 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">Visita</span>
                    <Input type="number" min={1} value={m.visits} onChange={e => updateMilestone(m.key, { visits: e.target.value })}
                      className="w-14 h-9 border-0 bg-transparent text-center focus-visible:ring-0 px-1" aria-label="Número de visita" />
                  </div>
                  <Input value={m.reward} onChange={e => updateMilestone(m.key, { reward: e.target.value })} maxLength={200}
                    placeholder="Ej: 10% de descuento" className="flex-1" aria-label="Premio" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setMilestones(milestones.filter(x => x.key !== m.key))} aria-label="Quitar premio">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="goldOutline" size="sm" onClick={addMilestone} disabled={milestones.length >= 20}>
            <Plus className="h-4 w-4" /> Agregar premio
          </Button>
        </Section>


        <Section icon={CalendarDays} title="Inicio" hint="Los turnos atendidos antes de esta fecha no suman.">
          <Input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} className="w-48" aria-label="Fecha de inicio" />
        </Section>

        <div className="p-5 sm:p-6 flex items-center justify-between gap-3 bg-background/30">
          <p className="text-xs text-muted-foreground">{dirty ? "Tenés cambios sin guardar." : "Todo guardado."}</p>
          <Button variant="gold" onClick={save} disabled={busy || !dirty} className="min-w-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 space-y-3">
        <p className="text-xs uppercase tracking-luxury text-primary">Así la ve el cliente</p>
        <StampCard
          name="Juan Pérez" cycleVisits={Math.min(2, previewVisits - 1)} visitsRequired={previewVisits}
          rewardDescription={reward.trim() || "Premio final"} milestones={previewMilestones}
        />
        {previewMilestones.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5 text-primary" /> Regalo sorpresa en la visita {previewMilestones.sort((a, b) => a - b).join(", ")}.
          </p>
        )}
      </aside>
    </div>
  );
};

// =====================================================================
// Clientes con tarjeta + alta desde el local
// =====================================================================
interface CardRow {
  client_id: string;
  cycle_visits: number;
  total_visits: number;
  clients: { first_name: string; last_name: string | null; phone: string | null; email: string | null; user_id: string | null } | null;
}

const CardsTab = ({ program, onChanged }: { program: Program | null; onChanged: () => void }) => {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const required = program?.visits_required ?? 10;

  const load = useCallback(async () => {
    const { data } = await supabase.from("loyalty_accounts")
      .select("client_id, cycle_visits, total_visits, clients(first_name, last_name, phone, email, user_id)")
      .order("updated_at", { ascending: false }).limit(1000);
    setRows((data as unknown as CardRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const c = r.clients;
    return [c?.first_name, c?.last_name, c?.phone, c?.email].some(v => v?.toLowerCase().includes(t));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o email" className="pl-9" />
        </div>
        <Button variant="gold" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Agregar tarjeta</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="luxury-card p-10 text-center text-muted-foreground space-y-2">
          <Gift className="h-8 w-8 mx-auto opacity-40" />
          <p>{rows.length === 0 ? "Todavía no hay tarjetas. Pasá las tarjetas físicas con \"Agregar tarjeta\"." : "No hay resultados."}</p>
        </div>
      ) : (
        <div className="luxury-card divide-y divide-border">
          {filtered.map(r => {
            const c = r.clients;
            const stamps = Math.min(r.cycle_visits, required);
            return (
              <div key={r.client_id} className="flex items-center gap-4 px-4 sm:px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{[c?.phone, c?.email].filter(Boolean).join(" · ") || "Sin contacto"}</p>
                </div>
                <span className={cn("hidden sm:inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border",
                  c?.user_id ? "border-primary/40 text-primary" : "border-border text-muted-foreground")}>
                  {c?.user_id ? <><BadgeCheck className="h-3 w-3" /> Web</> : <><Store className="h-3 w-3" /> Local</>}
                </span>
                <div className="w-28 sm:w-36 flex-shrink-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Sellos</span>
                    <span className="text-primary font-medium">{stamps}/{required}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-[hsl(38_65%_50%)]" style={{ width: `${(stamps / required) * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCardDialog open={addOpen} onOpenChange={setAddOpen} required={required} onCreated={() => { load(); onChanged(); }} />
    </div>
  );
};

interface FoundClient {
  id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null;
  hasCard: boolean;
}
const sanitize = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

const AddCardDialog = ({ open, onOpenChange, required, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; required: number; onCreated: () => void;
}) => {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<FoundClient | null>(null);
  const [form, setForm] = useState({ first: "", last: "", phone: "", email: "", whatsapp: "", day: "", month: "", year: "" });
  const [stamps, setStamps] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("existing"); setQ(""); setResults([]); setPicked(null); setStamps(0); setNote("");
    setForm({ first: "", last: "", phone: "", email: "", whatsapp: "", day: "", month: "", year: "" });
  }, [open]);

  useEffect(() => {
    const term = sanitize(q);
    if (mode !== "existing" || picked || term.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name, phone, email, loyalty_accounts(client_id)")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .order("first_name").limit(8);
      setResults((data ?? []).map(c => {
        const acc = c.loyalty_accounts as unknown;
        return { id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email,
          hasCard: Array.isArray(acc) ? acc.length > 0 : !!acc };
      }));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, picked]);

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    const d = form.day ? Number(form.day) : null;
    const m = form.month ? Number(form.month) : null;
    const y = form.year ? Number(form.year) : null;
    if (mode === "existing" && !picked) return toast.error("Elegí el cliente.");
    if (mode === "new") {
      if (form.first.trim().length < 2) return toast.error("Escribí el nombre.");
      if (!form.phone.trim() && !form.email.trim()) return toast.error("Cargá al menos un teléfono o un email.");
      if (!isValidBirthday(d, m, y)) return toast.error("Revisá la fecha de nacimiento.");
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_card", mode === "existing"
      ? { _client_id: picked!.id, _initial_visits: stamps, _note: note.trim() || undefined }
      : {
          _client_id: null, _first_name: form.first.trim(), _last_name: form.last.trim() || undefined,
          _phone: form.phone.trim() || undefined, _email: form.email.trim() || undefined,
          _whatsapp: form.whatsapp.trim() || undefined,
          _birth_day: d ?? undefined, _birth_month: m ?? undefined, _birth_year: y ?? undefined,
          _initial_visits: stamps, _note: note.trim() || undefined,
        });
    setBusy(false);
    if (error) return toast.error(loyaltyErrorMessage(error));
    toast.success("Tarjeta creada");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Agregar tarjeta</DialogTitle>
          <DialogDescription>Pasá a la web una tarjeta física, con los sellos que ya tenía.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Tabs value={mode} onValueChange={v => setMode(v as "existing" | "new")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="existing" className="gap-2"><Users className="h-4 w-4" /> Ya es cliente</TabsTrigger>
              <TabsTrigger value="new" className="gap-2"><UserPlus className="h-4 w-4" /> Cliente nuevo</TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="mt-4 space-y-2">
              {picked ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{picked.first_name} {picked.last_name ?? ""}</p>
                    <p className="text-xs text-muted-foreground truncate">{[picked.phone, picked.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>Cambiar</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, teléfono o email" className="pl-9" />
                    {searching && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
                  </div>
                  {results.length > 0 && (
                    <ul className="rounded-md border border-border divide-y divide-border max-h-60 overflow-y-auto">
                      {results.map(c => (
                        <li key={c.id}>
                          <button type="button" disabled={c.hasCard} onClick={() => setPicked(c)}
                            className="w-full text-left px-3 py-2 hover:bg-primary/5 disabled:opacity-50 disabled:hover:bg-transparent flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{c.first_name} {c.last_name ?? ""}</span>
                              <span className="block truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                            </span>
                            {c.hasCard && <span className="text-[11px] text-primary flex-shrink-0">Ya tiene tarjeta</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sanitize(q).length >= 2 && !searching && results.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No lo encontramos. <button type="button" className="text-primary hover:underline" onClick={() => setMode("new")}>Cargalo como cliente nuevo</button>.
                    </p>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="new" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="ac-first">Nombre *</Label><Input id="ac-first" value={form.first} onChange={e => set("first")(e.target.value)} maxLength={50} className="mt-1.5" /></div>
                <div><Label htmlFor="ac-last">Apellido</Label><Input id="ac-last" value={form.last} onChange={e => set("last")(e.target.value)} maxLength={50} className="mt-1.5" /></div>
                <div><Label htmlFor="ac-phone">Teléfono</Label><Input id="ac-phone" type="tel" value={form.phone} onChange={e => set("phone")(e.target.value)} maxLength={25} className="mt-1.5" /></div>
                <div><Label htmlFor="ac-wa">WhatsApp</Label><Input id="ac-wa" type="tel" value={form.whatsapp} onChange={e => set("whatsapp")(e.target.value)} maxLength={25} placeholder="+54 9 297..." className="mt-1.5" /></div>
              </div>
              <div>
                <Label htmlFor="ac-email">Email</Label>
                <Input id="ac-email" type="email" value={form.email} onChange={e => set("email")(e.target.value)} maxLength={255} className="mt-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1">Con su email, el cliente puede entrar después a ver su tarjeta en la web.</p>
              </div>
              <div>
                <Label>Fecha de nacimiento</Label>
                <BirthdayPicker day={form.day} month={form.month} year={form.year} onDay={set("day")} onMonth={set("month")} onYear={set("year")} />
              </div>
              <p className="text-[11px] text-muted-foreground">* Obligatorio, más un teléfono o un email.</p>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Sellos que ya tiene</p>
                <p className="text-xs text-muted-foreground">Los de su tarjeta física.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setStamps(s => Math.max(0, s - 1))} disabled={stamps === 0} aria-label="Menos"><Minus className="h-4 w-4" /></Button>
                <span className="w-10 text-center font-serif text-2xl text-primary">{stamps}</span>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setStamps(s => Math.min(required - 1, s + 1))} disabled={stamps >= required - 1} aria-label="Más"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-hidden>
              {Array.from({ length: required }, (_, i) => (
                <span key={i} className={cn("h-4 w-4 rounded-full border", i < stamps ? "bg-primary border-primary" : "border-primary/30")} />
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ac-note">Nota (opcional)</Label>
            <Textarea id="ac-note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Ej: tarjeta física N° 123" className="mt-1.5" />
          </div>

          <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear tarjeta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// =====================================================================
// Números
// =====================================================================
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

const StatsStrip = ({ refreshKey }: { refreshKey: number }) => {
  const [st, setSt] = useState<{ cards: number; newCards: number; visits: number; monthVisits: number; earned: number; pending: number } | null>(null);

  useEffect(() => {
    const ms = monthStart();
    const msDate = ms.toLocaleDateString("en-CA");
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then(r => r.count ?? 0);
    Promise.all([
      count(supabase.from("loyalty_accounts").select("client_id", { count: "exact", head: true })),
      count(supabase.from("loyalty_events").select("id", { count: "exact", head: true })
        .in("event_type", ["client_registered", "card_imported"]).gte("created_at", ms.toISOString())),
      count(supabase.from("loyalty_visits").select("id", { count: "exact", head: true }).is("reversed_at", null)),
      count(supabase.from("loyalty_visits").select("id", { count: "exact", head: true }).is("reversed_at", null).gte("visit_date", msDate)),
      count(supabase.from("loyalty_rewards").select("id", { count: "exact", head: true }).neq("status", "voided")),
      count(supabase.from("loyalty_rewards").select("id", { count: "exact", head: true }).eq("status", "available")),
    ]).then(([cards, newCards, visits, monthVisits, earned, pending]) => setSt({ cards, newCards, visits, monthVisits, earned, pending }));
  }, [refreshKey]);

  const month = new Date().toLocaleDateString("es-AR", { month: "long" });
  const tiles = [
    { icon: CreditCard, label: "Tarjetas", value: st?.cards, sub: st ? `+${st.newCards} en ${month}` : "" },
    { icon: Footprints, label: "Visitas sumadas", value: st?.visits, sub: st ? `${st.monthVisits} en ${month}` : "" },
    { icon: Trophy, label: "Premios ganados", value: st?.earned, sub: "desde el inicio" },
    { icon: Hourglass, label: "Por canjear", value: st?.pending, sub: "pendientes", highlight: (st?.pending ?? 0) > 0 },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div key={t.label} className={cn("luxury-card p-4", t.highlight && "border-primary/50")}>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><t.icon className="h-3.5 w-3.5 text-primary" /> {t.label}</p>
          <p className="font-serif text-3xl mt-1">{t.value ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">{t.sub}</p>
        </div>
      ))}
    </div>
  );
};

// =====================================================================
// Premios por canjear
// =====================================================================
interface RewardRow {
  id: string; reward_description: string; visits_required: number; earned_at: string;
  status: string; redeemed_at: string | null;
  clients: { first_name: string; last_name: string | null; phone: string | null } | null;
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const RewardsTab = ({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) => {
  const [pending, setPending] = useState<RewardRow[]>([]);
  const [recent, setRecent] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sel = "id, reward_description, visits_required, earned_at, status, redeemed_at, clients(first_name, last_name, phone)";
    const [a, r] = await Promise.all([
      supabase.from("loyalty_rewards").select(sel).eq("status", "available").order("earned_at", { ascending: true }).limit(500),
      supabase.from("loyalty_rewards").select(sel).eq("status", "redeemed").order("redeemed_at", { ascending: false }).limit(10),
    ]);
    setPending((a.data as unknown as RewardRow[]) ?? []);
    setRecent((r.data as unknown as RewardRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const redeem = async (r: RewardRow) => {
    const name = r.clients ? `${r.clients.first_name} ${r.clients.last_name ?? ""}`.trim() : "el cliente";
    if (!confirm(`¿Marcar como canjeado "${r.reward_description}" de ${name}?`)) return;
    setBusyId(r.id);
    const { error } = await supabase.rpc("redeem_reward", { _reward_id: r.id });
    setBusyId(null);
    if (error) return toast.error(loyaltyErrorMessage(error));
    toast.success("Premio canjeado");
    load();
    onChanged();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <div className="luxury-card p-10 text-center text-muted-foreground space-y-2">
          <Trophy className="h-8 w-8 mx-auto opacity-40" />
          <p>No hay premios pendientes de canjear.</p>
        </div>
      ) : (
        <div className="luxury-card divide-y divide-border">
          {pending.map(r => (
            <div key={r.id} className="flex items-center gap-4 px-4 sm:px-5 py-3">
              <div className="h-10 w-10 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Gift className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{r.reward_description}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.clients ? `${r.clients.first_name} ${r.clients.last_name ?? ""}`.trim() : "—"}
                  {r.clients?.phone ? ` · ${r.clients.phone}` : ""} · visita {r.visits_required} · ganado el {fmtDate(r.earned_at)}
                </p>
              </div>
              <Button variant="goldOutline" size="sm" onClick={() => redeem(r)} disabled={busyId === r.id}>
                {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Canjear</>}
              </Button>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-luxury text-muted-foreground mb-2">Últimos canjeados</p>
          <div className="luxury-card divide-y divide-border">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-2.5 text-sm">
                <span className="truncate">
                  {r.reward_description} <span className="text-muted-foreground">· {r.clients ? `${r.clients.first_name} ${r.clients.last_name ?? ""}`.trim() : "—"}</span>
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{r.redeemed_at ? fmtDate(r.redeemed_at) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
