import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { DAYS_SHORT, formatTime, formatPrice, toISODate, getDayAgenda, type DaySlot, type Schedule } from "@/lib/booking";
import { Database } from "@/integrations/supabase/types";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Lock, Unlock, Phone, Scissors } from "lucide-react";
import { BlockSlotDialog } from "@/components/BlockSlotDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Appt = Database["public"]["Tables"]["appointments"]["Row"];

const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const r = new Date(d); r.setDate(d.getDate() - diff); r.setHours(0,0,0,0);
  return r;
};

const BarberPanel = () => {
  const { user } = useAuth();
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [barberId, setBarberId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [agenda, setAgenda] = useState<DaySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockDefaults, setBlockDefaults] = useState<{ start?: string; end?: string; reason?: string }>({});

  useEffect(() => {
    if (!user) return;
    supabase.from("barbers").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setBarberId(data?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!barberId) return;
    supabase.from("schedules").select("*").eq("barber_id", barberId)
      .then(({ data }) => setSchedules((data ?? []) as Schedule[]));
  }, [barberId]);

  const range = useMemo(() => {
    if (view === "day") return [date, date];
    const s = startOfWeek(date);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [s, e];
  }, [view, date]);

  const load = useCallback(async () => {
    if (!barberId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("appointments")
      .select("*")
      .eq("barber_id", barberId)
      .gte("appointment_date", toISODate(range[0]))
      .lte("appointment_date", toISODate(range[1]))
      .order("appointment_date").order("appointment_time");
    const appts = (data ?? []) as Appt[];
    setAppointments(appts);

    if (view === "day" && schedules.length > 0) {
      const dayAppts = appts
        .filter(a => a.appointment_date === toISODate(date))
        .map(a => ({ id: a.id, appointment_time: a.appointment_time, status: a.status }));
      const res = await getDayAgenda(barberId, date, schedules, dayAppts);
      setAgenda(res.slots);
    }
    setLoading(false);
  }, [barberId, range, view, date, schedules]);

  useEffect(() => { load(); }, [load]);

  const navigate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + (view === "day" ? delta : delta * 7));
    setDate(d);
  };

  const onSlotClick = (slot: DaySlot) => {
    if (slot.status === "taken" && slot.appointmentId) {
      const a = appointments.find(x => x.id === slot.appointmentId);
      if (a) setSelected(a);
    }
  };

  const onLockClick = async (slot: DaySlot, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!barberId) return;
    if (slot.status === "blocked") {
      // unblock: find the matching block and delete
      const isoDate = toISODate(date);
      const slotMin = timeToMinutes(slot.time + ":00");
      const { data: blocks } = await supabase.from("barber_blocks")
        .select("*")
        .eq("barber_id", barberId)
        .eq("block_date", isoDate);
      const match = (blocks ?? []).find((b: any) => {
        if (!b.start_time || !b.end_time) return true;
        const bs = timeToMinutes(b.start_time);
        const be = timeToMinutes(b.end_time);
        return slotMin >= bs && slotMin < be;
      });
      if (!match) return;
      if (!confirm("¿Quitar el bloqueo?")) return;
      const { error } = await supabase.from("barber_blocks").delete().eq("id", match.id);
      if (error) return toast.error(error.message);
      toast.success("Bloqueo eliminado");
      load();
      return;
    }
    if (slot.status === "available") {
      // open block dialog prefilled
      const slotEnd = minutesToTime(timeToMinutes(slot.time + ":00") + 40).slice(0, 5);
      setBlockDefaults({ start: slot.time, end: slotEnd, reason: "Reservado por WhatsApp" });
      setBlockOpen(true);
    }
  };

  const dayLabel = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <PanelLayout requireRole="barber">
      {!barberId ? (
        <div className="luxury-card p-6 text-center">
          <Scissors className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="font-serif text-xl mb-1">Tu cuenta aún no está vinculada a un barbero</h2>
          <p className="text-sm text-muted-foreground">Pedile a un administrador que vincule tu usuario a un barbero del estudio.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl">Mis turnos</h1>
              <p className="text-sm text-muted-foreground capitalize">{view === "day" ? dayLabel : `Semana del ${range[0].toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}</p>
            </div>
            <div className="flex gap-2">
              <div className="flex rounded-md border border-border overflow-hidden">
                <button onClick={() => setView("day")} className={cn("px-3 py-1.5 text-sm", view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Día</button>
                <button onClick={() => setView("week")} className={cn("px-3 py-1.5 text-sm", view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Semana</button>
              </div>
              <Button variant="goldOutline" size="sm" onClick={() => { setBlockDefaults({ reason: "Reservado por WhatsApp" }); setBlockOpen(true); }}>
                <Lock className="h-3.5 w-3.5" /> Bloquear
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setDate(() => { const d = new Date(); d.setHours(0,0,0,0); return d; })}>Hoy</Button>
              <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : view === "day" ? (
            <DayAgenda
              slots={agenda}
              appointments={appointments.filter(a => a.appointment_date === toISODate(date))}
              onSlotClick={onSlotClick}
              onLockClick={onLockClick}
            />
          ) : (
            <WeekGrid weekStart={range[0]} appointments={appointments} onSelect={setSelected} />
          )}
        </>
      )}

      <AppointmentSheet
        appointment={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
      />

      {barberId && (
        <BlockSlotDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          barberId={barberId}
          defaultDate={date}
          defaultStartTime={blockDefaults.start}
          defaultEndTime={blockDefaults.end}
          defaultReason={blockDefaults.reason}
          onCreated={load}
        />
      )}
    </PanelLayout>
  );
};

const timeToMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

const DayAgenda = ({
  slots, appointments, onSlotClick, onLockClick,
}: {
  slots: DaySlot[];
  appointments: Appt[];
  onSlotClick: (s: DaySlot) => void;
  onLockClick: (s: DaySlot, e: React.MouseEvent) => void;
}) => {
  if (slots.length === 0) return (
    <div className="luxury-card p-10 text-center">
      <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p className="text-muted-foreground">No hay horario configurado para este día.</p>
    </div>
  );

  const apptById = new Map(appointments.map(a => [a.id, a]));
  const totalAtendidos = appointments
    .filter(a => a.status === "atendido")
    .reduce((sum, a) => sum + Number(a.service_price), 0);
  const countTurnos = slots.filter(s => s.status === "taken").length;

  return (
    <>
      <div className="luxury-card overflow-hidden divide-y divide-border">
        {slots.map((slot) => {
          const appt = slot.appointmentId ? apptById.get(slot.appointmentId) : null;
          const isClickable = slot.status === "taken";
          const lockable = slot.status === "available" || slot.status === "blocked";

          return (
            <div
              key={slot.time}
              onClick={() => isClickable && onSlotClick(slot)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 transition-colors",
                slot.status === "closed" && "bg-muted/30 text-muted-foreground",
                slot.status === "blocked" && "bg-destructive/5 text-muted-foreground",
                slot.status === "available" && "hover:bg-secondary/40",
                slot.status === "taken" && "bg-primary/5 hover:bg-primary/10 cursor-pointer",
              )}
            >
              <div className={cn(
                "font-mono text-sm w-14 flex-shrink-0 tabular-nums",
                slot.status === "taken" ? "text-primary font-semibold" : "text-foreground/70",
              )}>
                {slot.time}
              </div>

              <div className="flex-1 min-w-0 text-sm">
                {slot.status === "closed" && <span className="italic">Cerrado</span>}
                {slot.status === "blocked" && (
                  <span className="italic">Bloqueado <span className="text-xs">(no se pueden reservar turnos)</span></span>
                )}
                {slot.status === "available" && <span className="text-muted-foreground">Disponible</span>}
                {slot.status === "taken" && appt && (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{appt.client_name}</span>
                    <span className="text-muted-foreground truncate hidden sm:inline">· {appt.service_name}</span>
                    <span className="ml-auto text-primary font-semibold">{formatPrice(Number(appt.service_price))}</span>
                  </div>
                )}
              </div>

              {lockable && (
                <button
                  onClick={(e) => onLockClick(slot, e)}
                  title={slot.status === "blocked" ? "Quitar bloqueo" : "Bloquear este horario"}
                  className={cn(
                    "flex-shrink-0 p-1.5 rounded-md transition-colors",
                    slot.status === "blocked"
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-muted-foreground/60 hover:text-primary hover:bg-primary/10",
                  )}
                >
                  {slot.status === "blocked"
                    ? <Unlock className="h-4 w-4" />
                    : <Lock className="h-4 w-4" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="luxury-card mt-4 p-4">
        <h3 className="font-serif text-lg mb-3">Resumen del Día</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between p-2 rounded bg-secondary/30">
            <span className="text-muted-foreground">Turnos reservados</span>
            <span className="font-semibold">{countTurnos}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-secondary/30">
            <span className="text-muted-foreground">Atendidos</span>
            <span className="font-semibold text-primary">{formatPrice(totalAtendidos)}</span>
          </div>
        </div>
      </div>
    </>
  );
};

const WeekGrid = ({ weekStart, appointments, onSelect }: { weekStart: Date; appointments: Appt[]; onSelect: (a: Appt) => void }) => {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const today = toISODate(new Date());
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d, i) => {
        const iso = toISODate(d);
        const dayAppts = appointments.filter(a => a.appointment_date === iso);
        const isToday = iso === today;
        return (
          <div key={iso} className={cn("luxury-card p-3 min-h-[140px]", isToday && "border-primary/50")}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {DAYS_SHORT[(i + 1) % 7]} <span className={cn("ml-1", isToday && "text-primary font-semibold")}>{d.getDate()}</span>
            </div>
            {dayAppts.length === 0 ? (
              <div className="text-xs text-muted-foreground/50">—</div>
            ) : dayAppts.map(a => (
              <button key={a.id} onClick={() => onSelect(a)} className="w-full text-left p-2 mb-1 rounded bg-secondary/50 hover:bg-secondary text-xs border-l-2 border-primary">
                <div className="font-semibold text-primary">{formatTime(a.appointment_time)}</div>
                <div className="truncate">{a.client_name}</div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default BarberPanel;
