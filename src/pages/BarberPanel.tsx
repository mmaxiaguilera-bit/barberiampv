import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { DAYS_SHORT, formatTime, toISODate } from "@/lib/booking";
import { Database } from "@/integrations/supabase/types";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Lock, Phone, Scissors } from "lucide-react";
import { BlockSlotDialog } from "@/components/BlockSlotDialog";
import { cn } from "@/lib/utils";

type Appt = Database["public"]["Tables"]["appointments"]["Row"];

const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7; // make Mon=0
  const r = new Date(d); r.setDate(d.getDate() - diff); r.setHours(0,0,0,0);
  return r;
};

const BarberPanel = () => {
  const { user } = useAuth();
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [barberId, setBarberId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("barbers").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setBarberId(data?.id ?? null));
  }, [user]);

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
    setAppointments(data ?? []);
    setLoading(false);
  }, [barberId, range]);

  useEffect(() => { load(); }, [load]);

  const navigate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + (view === "day" ? delta : delta * 7));
    setDate(d);
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
              <Button variant="goldOutline" size="sm" onClick={() => setBlockOpen(true)}>
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
            <DayList appointments={appointments} onSelect={setSelected} />
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
          defaultReason="Reservado por WhatsApp"
        />
      )}
    </PanelLayout>
  );
};

const DayList = ({ appointments, onSelect }: { appointments: Appt[]; onSelect: (a: Appt) => void }) => {
  if (appointments.length === 0) return (
    <div className="luxury-card p-10 text-center">
      <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p className="text-muted-foreground">No tenés turnos para este día.</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {appointments.map(a => (
        <button key={a.id} onClick={() => onSelect(a)} className="w-full text-left luxury-card p-4 hover:border-primary/40">
          <div className="flex items-center gap-4">
            <div className="text-center flex-shrink-0">
              <div className="font-serif text-xl text-primary">{formatTime(a.appointment_time)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{a.client_name}</div>
              <div className="text-sm text-muted-foreground truncate flex items-center gap-2">
                <Scissors className="h-3 w-3" /> {a.service_name}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" /> {a.client_phone}
              </div>
            </div>
            <StatusBadge status={a.status} />
          </div>
        </button>
      ))}
    </div>
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
