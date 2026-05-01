import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Barber, Schedule, Service, formatPrice, formatTime, getAvailableSlots, toISODate } from "@/lib/booking";
import { CalendarIcon, Check, ChevronRight, Loader2, User, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { es } from "date-fns/locale";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const formSchema = z.object({
  first_name: z.string().trim().min(2, "Nombre: mínimo 2 caracteres").max(50),
  last_name: z.string().trim().min(2, "Apellido: mínimo 2 caracteres").max(50),
  client_phone: z.string().trim().min(6, "Teléfono inválido").max(25),
  birth_date: z.string().optional(),
});

export const BookingDialog = ({ open, onOpenChange }: BookingDialogProps) => {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);

  const [service, setService] = useState<Service | null>(null);
  const [barber, setBarber] = useState<Barber | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isReturningClient, setIsReturningClient] = useState(false);
  const [existingClientId, setExistingClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const [{ data: s, error: se }, { data: b }, { data: sc }] = await Promise.all([
        supabase.from("services").select("*").eq("active", true).order("display_order"),
        supabase.from("barbers").select("*").eq("active", true).order("display_order"),
        supabase.from("schedules").select("*").eq("active", true),
      ]);
      if (se) toast.error("No se pudieron cargar los servicios. Intentá de nuevo.");
      setServices(s ?? []);
      setBarbers(b ?? []);
      setSchedules(sc ?? []);
      setLoading(false);
    })();
  }, [open]);

  useEffect(() => {
    if (!barber || !date) { setSlots([]); return; }
    setLoadingSlots(true);
    getAvailableSlots(barber.id, date, schedules)
      .then(setSlots)
      .finally(() => setLoadingSlots(false));
  }, [barber, date, schedules]);

  const lookupPhone = async (p: string) => {
    if (p.length < 6) { setIsReturningClient(false); setExistingClientId(null); return; }
    setLookingUp(true);
    const { data } = await supabase.rpc("get_client_by_phone", { _phone: p });
    setLookingUp(false);
    if (data && data.length > 0) {
      const c = data[0];
      setFirstName(c.first_name);
      setLastName(c.last_name);
      setBirthDate(c.birth_date ?? "");
      setEmail((c as any).email ?? "");
      setIsReturningClient(true);
      setExistingClientId(c.id);
    } else {
      setIsReturningClient(false);
      setExistingClientId(null);
    }
  };

  const reset = () => {
    setStep(1); setService(null); setBarber(null); setDate(undefined);
    setTime(null); setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setBirthDate(""); setDone(false); setIsReturningClient(false); setExistingClientId(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) setTimeout(reset, 300);
    onOpenChange(o);
  };

  const submit = async () => {
    const parsed = formSchema.safeParse({ first_name: firstName, last_name: lastName, client_phone: phone, birth_date: birthDate });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!service || !barber || !date || !time) return;
    setSubmitting(true);

    // Resolver ID del cliente
    let resolvedClientId: string;

    if (isReturningClient && existingClientId) {
      // Cliente ya reconocido por teléfono, usar su ID directamente
      resolvedClientId = existingClientId;
    } else {
      // Cliente nuevo: INSERT puro (upsert falla por RLS con anon en UPDATE)
      const { data: inserted, error: insertError } = await supabase
        .from("clients")
        .insert({
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          phone: parsed.data.client_phone,
          ...(parsed.data.birth_date ? { birth_date: parsed.data.birth_date } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          // Teléfono ya existía (race condition), buscar su ID
          const { data: existing } = await supabase.rpc("get_client_by_phone", { _phone: parsed.data.client_phone });
          if (!existing || existing.length === 0) { setSubmitting(false); toast.error("Error al registrar el cliente."); return; }
          resolvedClientId = existing[0].id;
        } else {
          setSubmitting(false);
          toast.error(insertError.message);
          return;
        }
      } else {
        resolvedClientId = inserted.id;
      }
    }

    const fullName = `${parsed.data.first_name} ${parsed.data.last_name}`;
    const { error } = await supabase.from("appointments").insert({
      client_name: fullName,
      client_phone: parsed.data.client_phone,
      client_id: resolvedClientId,
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
                  {loading && (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  )}
                  {!loading && services.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                      No hay servicios disponibles por el momento.
                    </div>
                  )}
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
                <div className="space-y-5">
                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Servicio</span><span>{service?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Barbero</span><span>{barber?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span>{date?.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" })}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Hora</span><span>{time && formatTime(time)}</span></div>
                    <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-muted-foreground">Total</span><span className="text-primary font-semibold">{service && formatPrice(service.price)}</span></div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="phone" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                        <Phone className="h-3 w-3" /> Teléfono
                      </Label>
                      <div className="relative">
                        <Input
                          id="phone"
                          value={phone}
                          onChange={e => { setPhone(e.target.value); lookupPhone(e.target.value); }}
                          placeholder="+54 9 297..."
                          maxLength={25}
                          className={lookingUp ? "pr-9" : ""}
                        />
                        {lookingUp && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="firstName" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                          <User className="h-3 w-3" /> Nombre
                        </Label>
                        <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" maxLength={50} />
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                          <User className="h-3 w-3 opacity-0" /> Apellido
                        </Label>
                        <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Pérez" maxLength={50} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                        <Mail className="h-3 w-3" /> Email <span className="text-muted-foreground/60 normal-case">(opcional, para notificaciones)</span>
                      </Label>
                      <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" maxLength={255} />
                    </div>
                    {!isReturningClient && (
                      <div>
                        <Label htmlFor="birthDate" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                          <CalendarIcon className="h-3 w-3" /> Fecha de nacimiento
                        </Label>
                        <Input id="birthDate" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
                      </div>
                    )}
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
