import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ArrowLeft, Calendar, Clock, Scissors, User, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/booking";

type Appt = {
  id: string;
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
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appt[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const search = async () => {
    if (phone.trim().length < 6) return toast.error("Ingresá tu número de teléfono");
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_appointments", { _phone: phone.trim() });
    setLoading(false);
    if (error) { toast.error("Error al buscar turnos"); return; }
    setAppointments((data ?? []) as Appt[]);
  };

  const cancelAppointment = async (id: string) => {
    setCancelling(id);
    const { data: ok, error } = await supabase.rpc("cancel_my_appointment", {
      _phone: phone.trim(),
      _appointment_id: id,
    });
    if (error || !ok) {
      setCancelling(null);
      toast.error("No se pudo cancelar el turno. Comunicate con la barbería.");
      return;
    }
    supabase.functions.invoke("send-cancellation-email", {
      body: { appointment_id: id },
    }).catch(() => {});
    setCancelling(null);
    toast.success("Turno cancelado correctamente");
    setAppointments(prev =>
      prev?.map(a => a.id === id ? { ...a, status: "cancelado" } : a) ?? []
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
            Ingresá tu número de teléfono para ver tus próximos turnos y, si necesitás, cancelarlos.
          </p>
        </div>

        <div className="luxury-card p-6 mb-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Número de teléfono</Label>
              <Input
                id="phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+54 9 297..."
                onKeyDown={e => e.key === "Enter" && search()}
              />
            </div>
            <Button variant="gold" className="w-full" onClick={search} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Buscar mis turnos</>}
            </Button>
          </div>
        </div>

        {appointments !== null && (
          appointments.length === 0 ? (
            <div className="luxury-card p-8 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay turnos próximos con este número.</p>
              <p className="text-xs text-muted-foreground/60 mt-2">¿Querés reservar uno nuevo?</p>
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
                  <div key={a.id} className="luxury-card p-4">
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
                      <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
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
                              {cancelling === a.id
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
                                onClick={() => cancelAppointment(a.id)}
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
      </div>
    </div>
  );
};

export default MyAppointment;
