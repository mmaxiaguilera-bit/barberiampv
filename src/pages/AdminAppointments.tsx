import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Database } from "@/integrations/supabase/types";
import { Barber, DAYS_SHORT, DaySlot, Schedule, Service, formatPrice, formatTime, getAvailableSlots, getDayAgenda, toISODate } from "@/lib/booking";
import { CalendarIcon, ChevronLeft, ChevronRight, Loader2, Plus, Filter } from "lucide-react";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const r = new Date(d); r.setDate(d.getDate() - diff); r.setHours(0,0,0,0);
  return r;
};

type Appt = Database["public"]["Tables"]["appointments"]["Row"] & { barbers?: { name: string } | null };

const AdminAppointments = () => {
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [barberFilter, setBarberFilter] = useState<string>("all");
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [agendaSchedules, setAgendaSchedules] = useState<Schedule[]>([]);
  const [adminAgenda, setAdminAgenda] = useState<DaySlot[]>([]);

  useEffect(() => {
    supabase.from("barbers").select("*").order("display_order")
      .then(({ data }) => setBarbers(data ?? []));
  }, []);

  useEffect(() => {
    if (barberFilter === "all") { setAgendaSchedules([]); setAdminAgenda([]); return; }
    supabase.from("schedules").select("*").eq("barber_id", barberFilter).eq("active", true)
      .then(({ data }) => setAgendaSchedules((data ?? []) as Schedule[]));
  }, [barberFilter]);

  useEffect(() => {
    if (barberFilter === "all" || agendaSchedules.length === 0 || view !== "day") { setAdminAgenda([]); return; }
    const dayAppts = appointments
      .filter(a => a.appointment_date === toISODate(date))
      .map(a => ({ id: a.id, appointment_time: a.appointment_time, status: a.status }));
    getDayAgenda(barberFilter, date, agendaSchedules, dayAppts).then(r => setAdminAgenda(r.slots));
  }, [barberFilter, date, appointments, agendaSchedules, view]);

  const range = useMemo(() => {
    if (view === "day") return [date, date];
    const s = startOfWeek(date);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [s, e];
  }, [view, date]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("appointments")
      .select("*, barbers(name)")
      .gte("appointment_date", toISODate(range[0]))
      .lte("appointment_date", toISODate(range[1]))
      .order("appointment_date").order("appointment_time");
    if (barberFilter !== "all") q = q.eq("barber_id", barberFilter);
    const { data } = await q;
    setAppointments((data ?? []) as Appt[]);
    setLoading(false);
  }, [range, barberFilter]);

  useEffect(() => { load(); }, [load]);

  const navigate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + (view === "day" ? delta : delta * 7));
    setDate(d);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Appt[]>();
    appointments.filter(a => a.appointment_date === toISODate(date)).forEach(a => {
      const key = a.barber_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [appointments, date]);

  const visibleBarbers = barberFilter === "all" ? barbers : barbers.filter(b => b.id === barberFilter);
  const isToday = toISODate(date) === toISODate(new Date());
  const todayBtn = isToday ? "Hoy" : date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const subtitle = view === "day"
    ? date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `Semana del ${range[0].toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Turnos</h1>
          <p className="text-sm text-muted-foreground capitalize">{subtitle}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setView("day")} className={cn("px-3 py-1.5 text-sm", view === "day" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Día</button>
            <button onClick={() => setView("week")} className={cn("px-3 py-1.5 text-sm", view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Semana</button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><CalendarIcon className="h-4 w-4" /> Fecha</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} locale={es} className="pointer-events-auto p-3" />
            </PopoverContent>
          </Popover>
          <Select value={barberFilter} onValueChange={setBarberFilter}>
            <SelectTrigger className="w-[160px] h-9"><Filter className="h-3 w-3" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los barberos</SelectItem>
              {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d); }}>{todayBtn}</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button variant="gold" size="sm"><Plus className="h-4 w-4" /> Crear</Button></DialogTrigger>
            <CreateAppointmentDialog onClose={() => { setCreateOpen(false); load(); }} initialDate={date} />
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : view === "week" ? (
        <AdminWeekGrid weekStart={range[0]} appointments={appointments} barberFilter={barberFilter} barbers={barbers} onSelect={setSelected} />
      ) : barberFilter !== "all" && adminAgenda.length > 0 ? (
        <AdminDayAgenda
          slots={adminAgenda}
          appointments={appointments.filter(a => a.appointment_date === toISODate(date))}
          onSelect={setSelected}
        />
      ) : appointments.filter(a => a.appointment_date === toISODate(date)).length === 0 ? (
        <div className="luxury-card p-10 text-center text-muted-foreground">No hay turnos para este día.</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {visibleBarbers.map(b => {
            const list = grouped.get(b.id) ?? [];
            return (
              <div key={b.id} className="luxury-card p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-serif">{b.name[0]}</div>
                  <div className="font-medium">{b.name}</div>
                  <span className="ml-auto text-xs text-muted-foreground">{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">Sin turnos</div>
                ) : (
                  <div className="space-y-2">
                    {list.map(a => (
                      <button key={a.id} onClick={() => setSelected(a)} className="w-full text-left p-3 rounded-md bg-secondary/40 hover:bg-secondary border-l-2 border-primary">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-serif text-primary">{formatTime(a.appointment_time)}</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <div className="text-sm mt-1 truncate">{a.client_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.service_name} · {formatPrice(Number(a.service_price))}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AppointmentSheet
        appointment={selected}
        open={!!selected}
        onOpenChange={o => !o && setSelected(null)}
        onChanged={load}
        canDelete
      />
    </PanelLayout>
  );
};

const AdminWeekGrid = ({
  weekStart, appointments, barberFilter, barbers, onSelect,
}: {
  weekStart: Date;
  appointments: Appt[];
  barberFilter: string;
  barbers: Barber[];
  onSelect: (a: Appt) => void;
}) => {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const today = toISODate(new Date());
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d, i) => {
        const iso = toISODate(d);
        const dayAppts = appointments.filter(a => {
          if (a.appointment_date !== iso) return false;
          if (barberFilter !== "all" && a.barber_id !== barberFilter) return false;
          return true;
        });
        const isToday = iso === today;
        return (
          <div key={iso} className={cn("luxury-card p-3 min-h-[140px]", isToday && "border-primary/50")}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {DAYS_SHORT[(i + 1) % 7]} <span className={cn("ml-1", isToday && "text-primary font-semibold")}>{d.getDate()}</span>
            </div>
            {dayAppts.length === 0 ? (
              <div className="text-xs text-muted-foreground/50">—</div>
            ) : dayAppts.map(a => {
              const barber = barbers.find(b => b.id === a.barber_id);
              return (
                <button key={a.id} onClick={() => onSelect(a)} className="w-full text-left p-2 mb-1 rounded bg-secondary/50 hover:bg-secondary text-xs border-l-2 border-primary">
                  <div className="font-semibold text-primary">{formatTime(a.appointment_time)}</div>
                  <div className="truncate">{a.client_name}</div>
                  {barber && <div className="text-muted-foreground truncate">{barber.name}</div>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const CreateAppointmentDialog = ({ onClose, initialDate }: { onClose: () => void; initialDate: Date }) => {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState<Date>(initialDate);
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: b }, { data: sc }] = await Promise.all([
        supabase.from("services").select("*").eq("active", true),
        supabase.from("barbers").select("*").eq("active", true),
        supabase.from("schedules").select("*").eq("active", true),
      ]);
      setServices(s ?? []); setBarbers(b ?? []); setSchedules(sc ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!barberId || !date) { setSlots([]); return; }
    getAvailableSlots(barberId, date, schedules).then(setSlots);
  }, [barberId, date, schedules]);

  const submit = async () => {
    if (!serviceId || !barberId || !time || !name.trim() || !phone.trim()) return toast.error("Completá todos los campos");
    const svc = services.find(s => s.id === serviceId)!;
    setBusy(true);
    const { error } = await supabase.from("appointments").insert({
      client_name: name.trim(), client_phone: phone.trim(),
      service_id: svc.id, service_name: svc.name, service_price: svc.price,
      barber_id: barberId, appointment_date: toISODate(date), appointment_time: time, status: "pendiente",
    });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "Horario ya ocupado" : error.message);
    toast.success("Turno creado");
    onClose();
  };

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-serif text-2xl">Nuevo turno</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Cliente</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Teléfono</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Servicio</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Elegir..." /></SelectTrigger>
              <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Barbero</Label>
            <Select value={barberId} onValueChange={setBarberId}>
              <SelectTrigger><SelectValue placeholder="Elegir..." /></SelectTrigger>
              <SelectContent>{barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Fecha</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start"><CalendarIcon className="h-4 w-4" /> {date.toLocaleDateString("es-AR")}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} locale={es} className="pointer-events-auto p-3" /></PopoverContent>
          </Popover>
        </div>
        {barberId && (
          <div>
            <Label>Horario</Label>
            <div className="grid grid-cols-4 gap-2 mt-1 max-h-40 overflow-y-auto">
              {slots.length === 0 ? <div className="col-span-4 text-xs text-muted-foreground text-center py-3">Sin horarios disponibles</div> :
                slots.map(s => (
                  <button key={s} onClick={() => setTime(s)} className={cn("py-2 rounded text-sm border", time === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 border-border")}>
                    {formatTime(s)}
                  </button>
                ))}
            </div>
          </div>
        )}
        <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear turno"}
        </Button>
      </div>
    </DialogContent>
  );
};

const AdminDayAgenda = ({
  slots, appointments, onSelect,
}: {
  slots: DaySlot[];
  appointments: Appt[];
  onSelect: (a: Appt) => void;
}) => {
  const apptById = new Map(appointments.map(a => [a.id, a]));
  const countTurnos = slots.filter(s => s.status === "taken").length;

  return (
    <>
      <div className="luxury-card overflow-hidden divide-y divide-border">
        {slots.map((slot) => {
          const appt = slot.appointmentId ? apptById.get(slot.appointmentId) : null;
          const isClickable = slot.status === "taken" && !!appt;

          return (
            <div
              key={slot.time}
              onClick={() => isClickable && onSelect(appt!)}
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
              {slot.status === "taken" && appt && (
                <StatusBadge status={appt.status} />
              )}
            </div>
          );
        })}
      </div>
      <div className="luxury-card mt-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Turnos reservados</span>
          <span className="font-semibold">{countTurnos}</span>
        </div>
      </div>
    </>
  );
};

export default AdminAppointments;
