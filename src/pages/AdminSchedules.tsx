import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Barber, DAYS_ES, Schedule, formatTime } from "@/lib/booking";
import { Loader2, Plus, Trash2, Clock, Lock, Calendar as CalIcon, Save, Plane, Scissors, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BlockSlotDialog } from "@/components/BlockSlotDialog";
import { TripDialog } from "@/components/TripDialog";

type Block = {
  id: string;
  barber_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

// Bloqueos para mostrar: los días completos seguidos con el mismo motivo (un viaje) van en una sola fila
type BlockGroup = { ids: string[]; from: string; to: string; start_time: string | null; end_time: string | null; reason: string | null };

const nextDay = (iso: string) => {
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const groupBlocks = (blocks: Block[]): BlockGroup[] => {
  const groups: BlockGroup[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (last && !b.start_time && !last.start_time && last.reason === b.reason && nextDay(last.to) === b.block_date) {
      last.ids.push(b.id); last.to = b.block_date;
    } else {
      groups.push({ ids: [b.id], from: b.block_date, to: b.block_date, start_time: b.start_time, end_time: b.end_time, reason: b.reason });
    }
  }
  return groups;
};

// ----- Agenda semanal (borrador local; se guarda todo junto) -----
type SlotDraft = { key: string; id?: string; start: string; end: string };
type DayDraft = { open: boolean; slots: SlotDraft[] };
type ServiceRow = { id: string; name: string; duration_minutes: number; active: boolean };

// Lunes primero (DAYS_ES empieza en domingo = 0)
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STEP_OPTIONS = [10, 15, 20, 30, 40, 45, 60];
let draftKey = 0;
const newKey = () => `n${++draftKey}`;

const buildDrafts = (rows: Schedule[]): Record<number, DayDraft> => {
  const out: Record<number, DayDraft> = {};
  for (let dow = 0; dow < 7; dow++) {
    const day = rows.filter(r => r.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
    out[dow] = {
      open: day.some(r => r.active),
      slots: day.map(r => ({ key: r.id, id: r.id, start: formatTime(r.start_time), end: formatTime(r.end_time) })),
    };
  }
  return out;
};

// El intervalo más usado por el barbero (antes se cargaba en cada franja)
const commonStep = (rows: Schedule[]) => {
  const counts = new Map<number, number>();
  rows.forEach(r => counts.set(r.slot_minutes, (counts.get(r.slot_minutes) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 40;
};

const AdminSchedules = () => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [barberId, setBarberId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.from("barbers").select("*").order("display_order"),
      supabase.from("schedules").select("*").order("day_of_week").order("start_time"),
    ]);
    setBarbers(b ?? []);
    setSchedules(s ?? []);
    if (!barberId && b && b.length > 0) setBarberId(b[0].id);
    setLoading(false);
  }, [barberId]);

  useEffect(() => { load(); }, [load]);

  const currentBarber = barbers.find(b => b.id === barberId);

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-luxury text-primary">Agenda</p>
          <h1 className="font-serif text-3xl sm:text-4xl">Horarios</h1>
        </div>
        <Select value={barberId} onValueChange={setBarberId}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Elegí un barbero" /></SelectTrigger>
          <SelectContent>{barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !currentBarber ? (
        <div className="luxury-card p-6 text-center text-muted-foreground">No hay barberos. Creá uno primero.</div>
      ) : (
        <Tabs defaultValue="agenda">
          <TabsList>
            <TabsTrigger value="agenda"><Clock className="h-3.5 w-3.5 mr-1" /> Agenda semanal</TabsTrigger>
            <TabsTrigger value="bloqueos"><Lock className="h-3.5 w-3.5 mr-1" /> Bloqueos</TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="mt-5 space-y-4">
            <ServiceDurations />
            <WeekEditor
              key={barberId}
              barberId={barberId}
              rows={schedules.filter(s => s.barber_id === barberId)}
              onSaved={load}
            />
          </TabsContent>

          <TabsContent value="bloqueos" className="mt-4">
            <BlocksManager barberId={barberId} barberName={currentBarber.name} />
          </TabsContent>
        </Tabs>
      )}
    </PanelLayout>
  );
};

// ----- Duración de cada servicio (tabla services; vale para todos los barberos) -----
const ServiceDurations = () => {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("services").select("id, name, duration_minutes, active").eq("active", true).order("display_order").order("name");
    setServices(data ?? []);
    setValues(Object.fromEntries((data ?? []).map(s => [s.id, String(s.duration_minutes)])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = services.some(s => values[s.id] !== String(s.duration_minutes));

  const save = async () => {
    for (const s of services) {
      const n = Number(values[s.id]);
      if (!Number.isInteger(n) || n < 5 || n > 300) return toast.error(`${s.name}: la duración tiene que ser entre 5 y 300 minutos.`);
    }
    setBusy(true);
    const changed = services.filter(s => values[s.id] !== String(s.duration_minutes));
    const results = await Promise.all(changed.map(s => supabase.from("services").update({ duration_minutes: Number(values[s.id]) }).eq("id", s.id)));
    setBusy(false);
    const err = results.find(r => r.error);
    if (err?.error) return toast.error(err.error.message);
    toast.success("Duraciones guardadas");
    load();
  };

  if (services.length === 0) return null;
  return (
    <section className="luxury-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-serif text-xl flex items-center gap-2"><Scissors className="h-5 w-5 text-primary" /> Duración de cada servicio</h2>
          <p className="text-xs text-muted-foreground mt-1">Cuánto tiempo le ocupa al barbero. Vale para todos los barberos.</p>
        </div>
        {dirty && (
          <Button variant="gold" size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar duraciones"}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {services.map(s => (
          <label key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-3">
            <span className="text-sm truncate">{s.name}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <Input type="number" min={5} max={300} step={5} value={values[s.id] ?? ""} onChange={e => setValues(v => ({ ...v, [s.id]: e.target.value }))}
                className="w-16 h-9 text-center" aria-label={`Minutos de ${s.name}`} />
              <span className="text-xs text-muted-foreground">min</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
};

// ----- Semana del barbero -----
const WeekEditor = ({ barberId, rows, onSaved }: { barberId: string; rows: Schedule[]; onSaved: () => void }) => {
  const initial = useMemo(() => ({ days: buildDrafts(rows), step: commonStep(rows) }), [rows]);
  const [days, setDays] = useState(initial.days);
  const [step, setStep] = useState(initial.step);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDays(initial.days); setStep(initial.step); }, [initial]);

  const snapshot = (d: Record<number, DayDraft>) => JSON.stringify(WEEK_ORDER.map(i => [d[i].open, d[i].slots.map(x => [x.id ?? "", x.start, x.end])]));
  const dirty = step !== initial.step || snapshot(days) !== snapshot(initial.days);

  const setDay = (dow: number, patch: Partial<DayDraft>) => setDays(d => ({ ...d, [dow]: { ...d[dow], ...patch } }));
  const setSlot = (dow: number, key: string, patch: Partial<SlotDraft>) =>
    setDay(dow, { slots: days[dow].slots.map(x => (x.key === key ? { ...x, ...patch } : x)) });

  const toggleDay = (dow: number, open: boolean) => {
    const d = days[dow];
    setDay(dow, { open, slots: open && d.slots.length === 0 ? [{ key: newKey(), start: "10:00", end: "20:00" }] : d.slots });
  };
  const addSlot = (dow: number) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const ends = days[dow].slots.map(x => toMin(x.end));
    const lastEnd = ends.length ? Math.max(...ends) : null;
    // Después del último horario (2 h); si ya cierra tarde, propone uno a la mañana para editar
    const [start, end] = lastEnd === null ? [600, 1200] : lastEnd <= 22 * 60 ? [lastEnd, Math.min(lastEnd + 120, 23 * 60 + 59)] : [8 * 60, 10 * 60];
    setDay(dow, { open: true, slots: [...days[dow].slots, { key: newKey(), start: toTime(start), end: toTime(end) }] });
  };
  const removeSlot = (dow: number, key: string) => {
    const slots = days[dow].slots.filter(x => x.key !== key);
    setDay(dow, { slots, open: slots.length > 0 && days[dow].open });
  };
  const copyMonday = () => {
    const mon = days[1];
    if (!mon.open || mon.slots.length === 0) return toast.error("Primero cargá el horario del lunes.");
    if (!confirm("¿Copiar el horario del lunes de martes a sábado? El domingo no se toca.")) return;
    setDays(d => {
      const next = { ...d };
      for (const dow of [2, 3, 4, 5, 6]) {
        // Reutiliza las franjas existentes del día (por id) para no borrar y recrear de más
        const ids = d[dow].slots.map(x => x.id).filter(Boolean) as string[];
        next[dow] = { open: true, slots: mon.slots.map((x, i) => ({ key: newKey(), id: ids[i], start: x.start, end: x.end })) };
      }
      return next;
    });
  };

  const save = async () => {
    for (const dow of WEEK_ORDER) {
      const d = days[dow];
      const sorted = [...d.slots].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].start || !sorted[i].end || sorted[i].start >= sorted[i].end) return toast.error(`${DAYS_ES[dow]}: la hora de cierre tiene que ser después de la de apertura.`);
        if (i > 0 && sorted[i].start < sorted[i - 1].end) return toast.error(`${DAYS_ES[dow]}: hay horarios que se superponen.`);
      }
    }
    setSaving(true);
    const keepIds = new Set<string>();
    const ops: PromiseLike<{ error: { message: string } | null }>[] = [];
    for (const dow of WEEK_ORDER) {
      const d = days[dow];
      for (const x of d.slots) {
        const fields = { start_time: x.start + ":00", end_time: x.end + ":00", slot_minutes: step, active: d.open };
        if (x.id) { keepIds.add(x.id); ops.push(supabase.from("schedules").update(fields).eq("id", x.id)); }
        else ops.push(supabase.from("schedules").insert({ ...fields, barber_id: barberId, day_of_week: dow }));
      }
    }
    const toDelete = rows.map(r => r.id).filter(id => !keepIds.has(id));
    if (toDelete.length) ops.push(supabase.from("schedules").delete().in("id", toDelete));
    const results = await Promise.all(ops);
    setSaving(false);
    const err = results.find(r => r.error);
    if (err?.error) { toast.error(err.error.message); onSaved(); return; }
    toast.success("Horarios guardados");
    onSaved();
  };

  return (
    <section className="luxury-card overflow-hidden">
      <div className="p-5 flex items-center justify-between gap-3 flex-wrap border-b border-border">
        <div>
          <h2 className="font-serif text-xl flex items-center gap-2"><CalIcon className="h-5 w-5 text-primary" /> Semana</h2>
          <p className="text-xs text-muted-foreground mt-1">Interruptor apagado = ese día no trabaja.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ofrecer horarios cada</span>
          <Select value={String(step)} onValueChange={v => setStep(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...new Set([...STEP_OPTIONS, step])].sort((a, b) => a - b).map(m => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="px-5 pt-3 text-[11px] text-muted-foreground">
        Ej.: cada {step} min → se ofrece {[0, 1, 2].map(i => { const t = 10 * 60 + i * step; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }).join(", ")}… El turno ocupa lo que dura el servicio elegido.
      </p>

      <div className="divide-y divide-border mt-2">
        {WEEK_ORDER.map(dow => {
          const d = days[dow];
          return (
            <div key={dow} className="px-5 py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[7.5rem_3rem_1fr_auto] gap-x-4 gap-y-3 items-center">
              <span className={cn("font-serif text-lg", !d.open && "text-muted-foreground")}>{DAYS_ES[dow]}</span>
              <Switch checked={d.open} onCheckedChange={v => toggleDay(dow, v)} aria-label={`${DAYS_ES[dow]} abierto`} className="justify-self-end sm:justify-self-start" />
              <div className="col-span-2 sm:col-span-1 flex flex-wrap gap-2">
                {!d.open ? (
                  <span className="text-sm text-muted-foreground italic">Cerrado</span>
                ) : d.slots.map(x => (
                  <div key={x.key} className="flex items-center gap-1 rounded-lg border border-border bg-background/40 pl-2 pr-1 h-10">
                    <Input type="time" value={x.start} onChange={e => setSlot(dow, x.key, { start: e.target.value })} className="w-[5.5rem] h-8 border-0 bg-transparent px-1 focus-visible:ring-0" aria-label="Abre" />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" value={x.end} onChange={e => setSlot(dow, x.key, { end: e.target.value })} className="w-[5.5rem] h-8 border-0 bg-transparent px-1 focus-visible:ring-0" aria-label="Cierra" />
                    <button type="button" onClick={() => removeSlot(dow, x.key)} className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center" aria-label="Quitar horario">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {d.open ? (
                <button type="button" onClick={() => addSlot(dow)} className="col-span-2 sm:col-span-1 text-xs text-primary border border-dashed border-primary/50 rounded-lg px-3 h-10 hover:bg-primary/5 whitespace-nowrap">
                  + Agregar horario
                </button>
              ) : <span className="hidden sm:block" />}
            </div>
          );
        })}
      </div>

      <div className="p-5 flex items-center justify-between gap-3 flex-wrap border-t border-border bg-background/30">
        <Button variant="goldOutline" size="sm" onClick={copyMonday}><Copy className="h-4 w-4" /> Copiar el lunes de martes a sábado</Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{dirty ? "Tenés cambios sin guardar" : "Todo guardado"}</span>
          <Button variant="gold" onClick={save} disabled={saving || !dirty} className="min-w-36">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Guardar</>}
          </Button>
        </div>
      </div>
    </section>
  );
};

const BlocksManager = ({ barberId, barberName }: { barberId: string; barberName: string }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("barber_blocks")
      .select("*")
      .eq("barber_id", barberId)
      .gte("block_date", today)
      .order("block_date")
      .order("start_time", { nullsFirst: true });
    setBlocks((data ?? []) as Block[]);
    setLoading(false);
  }, [barberId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (ids: string[]) => {
    if (!confirm(ids.length > 1 ? `¿Eliminar estos ${ids.length} días bloqueados?` : "¿Eliminar este bloqueo?")) return;
    const { error } = await supabase.from("barber_blocks").delete().in("id", ids);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Bloqueos futuros de <span className="text-foreground">{barberName}</span></p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="goldOutline" size="sm" onClick={() => setTripOpen(true)}>
            <Plane className="h-3.5 w-3.5" /> Me voy de viaje
          </Button>
          <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo bloqueo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : blocks.length === 0 ? (
        <div className="luxury-card p-8 text-center">
          <CalIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay bloqueos próximos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groupBlocks(blocks).map(g => {
            const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00").toLocaleDateString("es-AR", opts);
            const fullDay = !g.start_time;
            const trip = g.ids.length > 1;
            return (
              <div key={g.ids[0]} className="luxury-card p-3 flex items-center gap-3">
                {trip ? <Plane className="h-4 w-4 text-destructive flex-shrink-0" /> : <Lock className="h-4 w-4 text-primary flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm first-letter:uppercase">
                    {trip
                      ? `Del ${fmt(g.from, { weekday: "short", day: "numeric", month: "short" })} al ${fmt(g.to, { weekday: "short", day: "numeric", month: "short" })}`
                      : fmt(g.from, { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {trip ? `${g.ids.length} días completos` : fullDay ? "Día completo" : `${formatTime(g.start_time!)} – ${formatTime(g.end_time!)}`}
                    {g.reason ? ` · ${g.reason}` : ""}
                  </div>
                </div>
                <Button size="icon" variant="outline" onClick={() => remove(g.ids)} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <BlockSlotDialog open={open} onOpenChange={setOpen} barberId={barberId} onCreated={load} />
      <TripDialog open={tripOpen} onOpenChange={setTripOpen} barberId={barberId} barberName={barberName} onCreated={load} />
    </div>
  );
};

export default AdminSchedules;
