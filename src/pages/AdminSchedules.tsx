import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Barber, DAYS_ES, Schedule, formatTime } from "@/lib/booking";
import { Loader2, Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

const AdminSchedules = () => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [barberId, setBarberId] = useState<string>("");
  const [loading, setLoading] = useState(true);

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

  const addSlot = async (dow: number) => {
    const { error } = await supabase.from("schedules").insert({
      barber_id: barberId, day_of_week: dow, start_time: "09:00:00", end_time: "18:00:00", slot_minutes: 45, active: true,
    });
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2"><Clock className="h-6 w-6 text-primary" /> Horarios</h1>
          <p className="text-sm text-muted-foreground">Configurá la agenda semanal de cada barbero</p>
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
        <div className="space-y-3">
          {DAYS_ES.map((dayName, dow) => {
            const slots = barberSchedules.filter(s => s.day_of_week === dow);
            return (
              <div key={dow} className="luxury-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{dayName}</h3>
                  <Button size="sm" variant="goldOutline" onClick={() => addSlot(dow)}>
                    <Plus className="h-3.5 w-3.5" /> Agregar franja
                  </Button>
                </div>
                {slots.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Día libre</p>
                ) : (
                  <div className="space-y-2">
                    {slots.map(s => <ScheduleRow key={s.id} schedule={s} onChanged={load} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelLayout>
  );
};

const ScheduleRow = ({ schedule, onChanged }: { schedule: Schedule; onChanged: () => void }) => {
  const [start, setStart] = useState(formatTime(schedule.start_time));
  const [end, setEnd] = useState(formatTime(schedule.end_time));
  const [slotMin, setSlotMin] = useState<string>(String(schedule.slot_minutes));
  const [active, setActive] = useState(schedule.active);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (start >= end) return toast.error("La hora de fin debe ser mayor al inicio");
    setBusy(true);
    const { error } = await supabase.from("schedules").update({
      start_time: start + ":00", end_time: end + ":00", slot_minutes: Number(slotMin) || 45, active,
    }).eq("id", schedule.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    onChanged();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta franja?")) return;
    const { error } = await supabase.from("schedules").delete().eq("id", schedule.id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-2 rounded-md bg-secondary/20 border border-border">
      <div>
        <Label className="text-[10px] uppercase">Desde</Label>
        <Input type="time" value={start} onChange={e => setStart(e.target.value)} />
      </div>
      <div>
        <Label className="text-[10px] uppercase">Hasta</Label>
        <Input type="time" value={end} onChange={e => setEnd(e.target.value)} />
      </div>
      <div>
        <Label className="text-[10px] uppercase">Turno (min)</Label>
        <Input type="number" min={5} step="5" value={slotMin} onChange={e => setSlotMin(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-2 px-2 h-10 rounded-md border border-border">
        <Label className="text-xs cursor-pointer">Activo</Label>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="gold" onClick={save} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
        </Button>
        <Button size="icon" variant="outline" onClick={remove} className="text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default AdminSchedules;
