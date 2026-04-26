import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Barber, Schedule, Service, formatPrice, formatTime, getAvailableSlots, toISODate } from "@/lib/booking";
import { CalendarIcon, Check, ChevronRight, Loader2, Scissors, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { es } from "date-fns/locale";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const formSchema = z.object({
  client_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  client_phone: z.string().trim().min(6, "Teléfono inválido").max(25),
});

export const BookingDialog = ({ open, onOpenChange }: BookingDialogProps) => {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [service, setService] = useState<Service | null>(null);
  const [barber, setBarber] = useState<Barber | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: s }, { data: b }, { data: sc }] = await Promise.all([
        supabase.from("services").select("*").eq("active", true).order("display_order"),
        supabase.from("barbers").select("*").eq("active", true).order("display_order"),
        supabase.from("schedules").select("*").eq("active", true),
      ]);
      setServices(s ?? []);
      setBarbers(b ?? []);
      setSchedules(sc ?? []);
    })();
  }, [open]);

  useEffect(() => {
    if (!barber || !date) { setSlots([]); return; }
    setLoadingSlots(true);
    getAvailableSlots(barber.id, date, schedules)
      .then(setSlots)
      .finally(() => setLoadingSlots(false));
  }, [barber, date, schedules]);

  const reset = () => {
    setStep(1); setService(null); setBarber(null); setDate(undefined);
    setTime(null); setName(""); setPhone(""); setDone(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) setTimeout(reset, 300);
    onOpenChange(o);
  };

  const submit = async () => {
    const parsed = formSchema.safeParse({ client_name: name, client_phone: phone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!service || !barber || !date || !time) return;
    setSubmitting(true);
    const { error } = await supabase.from("appointments").insert({
      client_name: parsed.data.client_name,
      client_phone: parsed.data.client_phone,
      service_id: service.id,
      service_name: service.name,
      service_price: service.price,
      barber_id: barber.id,
      appointment_date: toISODate(date),
      appointment_time: time,
      status: "pendiente",
    });
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ese horario acaba de ser reservado. Elegí otro.");
        const fresh = await getAvailableSlots(barber.id, date, schedules);
        setSlots(fresh);
        setTime(null);
      } else {
        toast.error(error.message);
      }
      return;
    }
    setDone(true);
  };

  const stepLabel = ["Servicio", "Barbero", "Fecha y hora", "Tus datos"][step - 1];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 gap-0 bg-card border-border max-h-[92vh] overflow-hidden flex flex-col">
        {!done ? (
          <>
            <DialogHeader className="p-6 pb-4 border-b border-border">
              <DialogTitle className="font-serif text-2xl">Reservar turno</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <span className="text-primary">Paso {step} de 4</span>
                <span className="text-muted-foreground">— {stepLabel}</span>
              </DialogDescription>
              <div className="flex gap-1 pt-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors",
                    i <= step ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
            </DialogHeader>

            <div className="p-6 overflow-y-auto flex-1">
              {step === 1 && (
                <div className="space-y-2">
                  {services.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setService(s); setStep(2); }}
                      className={cn(
                        "w-full text-left p-4 rounded-lg border border-border bg-secondary/30 hover:border-primary hover:bg-secondary/60 transition-all group",
                        service?.id === s.id && "border-primary bg-secondary/60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-muted-foreground truncate">{s.description}</div>
                          <div className="text-xs text-muted-foreground mt-1">{s.duration_minutes} min</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-primary font-semibold">{formatPrice(s.price)}</div>
                          <ChevronRight className="h-4 w-4 inline text-muted-foreground group-hover:text-primary mt-1" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-3">
                  {barbers.map(b => (
                    <button
                      key={b.id}
                      onClick={() => { setBarber(b); setStep(3); }}
                      className={cn(
                        "p-4 rounded-lg border border-border bg-secondary/30 hover:border-primary hover:bg-secondary/60 transition-all flex items-center gap-4",
                        barber?.id === b.id && "border-primary bg-secondary/60"
                      )}
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center font-serif text-xl text-primary">
                        {b.name[0]}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{b.name}</div>
                        <div className="text-sm text-muted-foreground">{b.bio}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Fecha</Label>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2 flex justify-center">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => { setDate(d); setTime(null); }}
                        disabled={(d) => d < new Date(new Date().toDateString())}
                        locale={es}
                        className="pointer-events-auto"
                      />
                    </div>
                  </div>
                  {date && (
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Horario disponible</Label>
                      {loadingSlots ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                      ) : slots.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                          No hay horarios disponibles este día.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {slots.map(s => (
                            <button
                              key={s}
                              onClick={() => setTime(s)}
                              className={cn(
                                "py-2.5 rounded-md text-sm border transition-all",
                                time === s
                                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                                  : "bg-secondary/30 border-border hover:border-primary/50"
                              )}
                            >
                              {formatTime(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Servicio</span><span>{service?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Barbero</span><span>{barber?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span>{date?.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" })}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Hora</span><span>{time && formatTime(time)}</span></div>
                    <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-muted-foreground">Total</span><span className="text-primary font-semibold">{service && formatPrice(service.price)}</span></div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="name" className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Nombre completo</Label>
                      <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez" maxLength={100} />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Teléfono</Label>
                      <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 ..." maxLength={25} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border p-4 flex gap-2 bg-card">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1" disabled={submitting}>
                  Atrás
                </Button>
              )}
              {step === 3 && (
                <Button variant="gold" onClick={() => setStep(4)} disabled={!date || !time} className="flex-1">
                  Continuar
                </Button>
              )}
              {step === 4 && (
                <Button variant="gold" onClick={submit} disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar turno"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-serif text-2xl">¡Turno reservado!</h3>
            <p className="text-muted-foreground text-sm">
              Te esperamos el <strong className="text-foreground">{date?.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</strong> a las <strong className="text-foreground">{time && formatTime(time)}</strong> con <strong className="text-foreground">{barber?.name}</strong>.
            </p>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Recordá llegar 5 minutos antes. Si no podés asistir, avisanos al WhatsApp.
            </div>
            <Button variant="gold" onClick={() => handleClose(false)} className="w-full">
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
