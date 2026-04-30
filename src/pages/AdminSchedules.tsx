import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Barber, DAYS_ES, Schedule, formatTime } from "@/lib/booking";
import { Loader2, Plus, Trash2, Clock, Lock, Calendar as CalIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { BlockSlotDialog } from "@/components/BlockSlotDialog";

type Block = {
  id: string;
  barber_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

type SlotDraft = { id: string; start: string; end: string; slotMin: string; active: boolean };

const AdminSchedules = () => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [barberId, setBarberId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, SlotDraft[]>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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

  const barberSchedules = schedules.filter(s => s.barber_id === barberId);
  const currentBarber = barbers.find(b => b.id === barberId);

  // Sync drafts whenever schedules or barber changes
  useEffect(() => {
    const newDrafts: Record<number, SlotDraft[]> = {};
    for (let dow = 0; dow < 7; dow++) {
      newDrafts[dow] = barberSchedules
        .filter(s => s.day_of_week === dow)
        .map(s => ({ id: s.id, start: formatTime(s.start_time), end: formatTime(s.end_time), slotMin: String(s.slot_minutes), active: s.active }));
    }
    setDrafts(newDrafts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, barberId]);

  const updateDraft = (dow: number, id: string, patch: Partial<SlotDraft>) => {
    setDrafts(prev => ({
      ...prev,
      [dow]: (prev[dow] ?? []).map(d => d.id === id ? { ...d, ...patch } : d),
    }));
  };

  const saveAll = async () => {
    for (let dow = 0; dow < 7; dow++) {
      for (const d of (drafts[dow] ?? [])) {
        if (d.start >= d.end) {
          toast.error(`${DAYS_ES[dow]}: la hora de fin debe ser mayor al inicio`);
          return;
        }
      }
    }
    setSaving(true);
    const allDrafts = Object.values(drafts).flat();
    const results = await Promise.all(
      allDrafts.map(d => supabase.from("schedules").update({
        start_time: d.start + ":00",
        end_time: d.end + ":00",
        slot_minutes: Number(d.slotMin) || 45,
        active: d.active,
      }).eq("id", d.id))
    );
    setSaving(false);
    const err = results.find(r => r.error);
    if (err?.error) return toast.error(err.error.message);
    toast.success("Horarios guardados");
    load();
  };

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2"><Clock className="h-6 w-6 text-primary" /> Horarios y bloqueos</h1>
          <p className="text-sm text-muted-foreground">Configurá la agenda semanal y los días/horas no disponibles</p>
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

          <TabsContent value="agenda" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button variant="gold" onClick={saveAll} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Guardar horarios</>}
              </Button>
            </div>
            <div className="space-y-3">
              {DAYS_ES.map((dayName, dow) => (
                <DaySection
                  key={dow}
                  dayName={dayName}
                  dow={dow}
                  slots={barberSchedules.filter(s => s.day_of_week === dow)}
                  drafts={drafts[dow] ?? []}
                  barberId={barberId}
                  onDraftChange={(id, patch) => updateDraft(dow, id, patch)}
                  onChanged={load}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bloqueos" className="mt-4">
            <BlocksManager barberId={barberId} barberName={currentBarber.name} />
          </TabsContent>
        </Tabs>
      )}
    </PanelLayout>
  );
};

const DaySection = ({ dayName, dow, slots, drafts, barberId, onDraftChange, onChanged }: {
  dayName: string;
  dow: number;
  slots: Schedule[];
  drafts: SlotDraft[];
  barberId: string;
  onDraftChange: (id: string, patch: Partial<SlotDraft>) => void;
  onChanged: () => void;
}) => {
  const addSlot = async () => {
    const { error } = await supabase.from("schedules").insert({
      barber_id: barberId, day_of_week: dow, start_time: "09:00:00", end_time: "18:00:00", slot_minutes: 45, active: true,
    });
    if (error) return toast.error(error.message);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta franja?")) return;
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <div className="luxury-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{dayName}</h3>
        <Button size="sm" variant="goldOutline" onClick={addSlot}>
          <Plus className="h-3.5 w-3.5" /> Agregar franja
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Día libre</p>
      ) : (
        <div className="space-y-2">
          {drafts.map(d => (
            <ScheduleRow key={d.id} draft={d} onChange={patch => onDraftChange(d.id, patch)} onRemove={() => remove(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

const ScheduleRow = ({ draft, onChange, onRemove }: {
  draft: SlotDraft;
  onChange: (patch: Partial<SlotDraft>) => void;
  onRemove: () => void;
}) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-2 rounded-md bg-secondary/20 border border-border">
    <div>
      <Label className="text-[10px] uppercase">Desde</Label>
      <Input type="time" value={draft.start} onChange={e => onChange({ start: e.target.value })} />
    </div>
    <div>
      <Label className="text-[10px] uppercase">Hasta</Label>
      <Input type="time" value={draft.end} onChange={e => onChange({ end: e.target.value })} />
    </div>
    <div>
      <Label className="text-[10px] uppercase">Turno (min)</Label>
      <Input type="number" min={5} step="5" value={draft.slotMin} onChange={e => onChange({ slotMin: e.target.value })} />
    </div>
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-between gap-2 px-2 h-10 rounded-md border border-border flex-1">
        <Label className="text-xs cursor-pointer">Activo</Label>
        <Switch checked={draft.active} onCheckedChange={v => onChange({ active: v })} />
      </div>
      <Button size="icon" variant="outline" onClick={onRemove} className="text-destructive hover:bg-destructive/10">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
);

const BlocksManager = ({ barberId, barberName }: { barberId: string; barberName: string }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este bloqueo?")) return;
    const { error } = await supabase.from("barber_blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Bloqueos futuros de <span className="text-foreground">{barberName}</span></p>
        <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo bloqueo
        </Button>
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
          {blocks.map(b => {
            const d = new Date(b.block_date + "T12:00:00");
            const fullDay = !b.start_time;
            return (
              <div key={b.id} className="luxury-card p-3 flex items-center gap-3">
                <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm capitalize">
                    {d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fullDay ? "Día completo" : `${formatTime(b.start_time!)} – ${formatTime(b.end_time!)}`}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </div>
                </div>
                <Button size="icon" variant="outline" onClick={() => remove(b.id)} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <BlockSlotDialog open={open} onOpenChange={setOpen} barberId={barberId} onCreated={load} />
    </div>
  );
};

export default AdminSchedules;
