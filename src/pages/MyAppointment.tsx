import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar, Clock, Scissors, User, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/booking";
import { forgetBooking, isToken, rememberBooking, rememberedTokens } from "@/lib/myBookings";

type Appt = {
  token: string;
  appointment_date: string;
  appointment_time: string;
  service_name: string;
  barber_name: string;
  status: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:  { label: "Pendiente",  color: "text-yellow-400" },
  confirmado: { label: "Confirmado", color: "text-green-400"  },
  atendido:   { label: "Atendido",   color: "text-blue-400"   },
  cancelado:  { label: "Cancelado",  color: "text-destructive"},
};

const MyAppointment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appt[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [sendingLinks, setSendingLinks] = useState(false);
  const [linksSent, setLinksSent] = useState(false);

  // Reenvío de links: solo le llegan al dueño del email (la respuesta no revela si hay turnos)
  const requestLinks = async () => {
    const value = linkEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return toast.error("Revisá el email");
    setSendingLinks(true);
    const { error } = await supabase.functions.invoke("send-booking-links", { body: { email: value } });
    setSendingLinks(false);
    if (error) return toast.error("No pudimos enviar el mail. Probá de nuevo en un rato.");
    setLinksSent(true);
  };

  // Turnos de este dispositivo + el del link del mail (?t=...). Sin token no se ve ningún turno.
  useEffect(() => {
    const fromLink = searchParams.get("t");
    const tokens = [...new Set([...(isToken(fromLink) ? [fromLink] : []), ...rememberedTokens()])];
    if (tokens.length === 0) { setAppointments([]); setLoading(false); return; }
    supabase.rpc("get_appointments_by_tokens", { _tokens: tokens }).then(({ data, error }) => {
      setLoading(false);
      if (error) { toast.error("Error al buscar tus turnos"); setAppointments([]); return; }
      const list = (data ?? []) as Appt[];
      // Guarda el turno del link en este dispositivo y olvida los que ya no existen
      for (const a of list) rememberBooking(a.token, a.appointment_date);
      for (const t of tokens) if (!list.some(a => a.token === t)) forgetBooking(t);
      setAppointments(list);
    });
  }, [searchParams]);

  const cancelAppointment = async (token: string) => {
    setCancelling(token);
    const { data: ok, error } = await supabase.rpc("cancel_appointment_by_token", { _token: token });
    if (error || !ok) {
      setCancelling(null);
      toast.error("No se pudo cancelar el turno. Comunicate con la barbería.");
      return;
    }
    supabase.functions.invoke("send-cancellation-email", {
      body: { cancel_token: token },
    }).catch(() => {});
    setCancelling(null);
    toast.success("Turno cancelado correctamente");
    setAppointments(prev =>
      prev?.map(a => a.token === token ? { ...a, status: "cancelado" } : a) ?? []
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <div className="flex-1 container px-4 py-12 max-w-xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-6">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>

        <div className="text-center mb-8">
          <p className="text-primary text-xs tracking-luxury uppercase mb-3">Portal del cliente</p>
          <h1 className="font-serif text-4xl mb-3">Mi turno</h1>
          <div className="gold-divider" />
          <p className="text-sm text-muted-foreground mt-4">
            Acá ves los turnos que reservaste desde este celular o computadora, y podés cancelarlos.
            Desde otro dispositivo, abrí el link del mail de confirmación o pedí que te lo reenviemos.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        )}

        {appointments !== null && (
          appointments.length === 0 ? (
            <div className="luxury-card p-8 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No encontramos turnos próximos en este dispositivo.</p>
              <p className="text-xs text-muted-foreground/60 mt-2">Si reservaste desde otro dispositivo, usá el link del mail o pedilo abajo.</p>
              <Button variant="goldOutline" size="sm" className="mt-4" onClick={() => navigate("/")}>
                Reservar turno
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => {
                const cfg = STATUS_CONFIG[a.status] ?? { label: a.status, color: "text-muted-foreground" };
                const dateStr = new Date(a.appointment_date + "T12:00:00").toLocaleDateString("es-AR", {
                  weekday: "long", day: "numeric", month: "long",
                });
                const isActivatable = a.status === "pendiente" || a.status === "confirmado";
                const appointmentDateTime = new Date(`${a.appointment_date}T${a.appointment_time}`);
                const hoursUntil = (appointmentDateTime.getTime() - Date.now()) / 3_600_000;
                const canCancel = isActivatable && hoursUntil > 3;
                const tooLate = isActivatable && hoursUntil <= 3;
                return (
                  <div key={a.token} className="luxury-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Scissors className="h-4 w-4 text-primary" />
                          <span className="font-medium">{a.service_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{a.barber_name}</span>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold uppercase tracking-[0.02em] ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t border-border pt-3">
                      <span className="flex items-center gap-1.5 capitalize">
                        <Calendar className="h-3.5 w-3.5" /> {dateStr}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> {formatTime(a.appointment_time)}
                      </span>
                    </div>

                    {tooLate && (
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Para cancelar comunicate con la barbería (menos de 3 hs antes del turno)
                      </p>
                    )}
                    {canCancel && (
                      <div className="mt-3">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                              disabled={!!cancelling}
                            >
                              {cancelling === a.token
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : "Cancelar turno"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-serif">¿Cancelar el turno?</AlertDialogTitle>
                              <AlertDialogDescription>
                                <strong className="text-foreground">{a.service_name}</strong> el{" "}
                                <span className="capitalize">{dateStr}</span> a las{" "}
                                {formatTime(a.appointment_time)} con {a.barber_name}.
                                <br />Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No, mantener</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cancelAppointment(a.token)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Sí, cancelar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {!loading && (
          <div className="luxury-card p-6 mt-6">
            {linksSent ? (
              <p className="text-sm text-muted-foreground text-center">
                Si tenés turnos próximos con <strong className="text-foreground">{linkEmail.trim()}</strong>, te llegó un mail
                con los links. Revisá también la carpeta de spam.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-sm">¿No ves tu turno?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Escribí el email que dejaste al reservar y te mandamos el link de cada turno.
                  </p>
                </div>
                <div>
                  <Label htmlFor="link-email" className="sr-only">Email</Label>
                  <Input id="link-email" type="email" value={linkEmail} maxLength={254} placeholder="tu@email.com"
                    onChange={e => setLinkEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && requestLinks()} />
                </div>
                <Button variant="goldOutline" className="w-full" onClick={requestLinks} disabled={sendingLinks}>
                  {sendingLinks ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Reenviame el link</>}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAppointment;
