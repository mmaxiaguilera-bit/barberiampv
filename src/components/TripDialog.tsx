import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { datesInRange, formatTime, getFullDayBlockedDates, toISODate } from "@/lib/booking";
import { AlertTriangle, Loader2, Plane } from "lucide-react";
import { toast } from "sonner";

const MAX_DAYS = 120;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  barberId: string;
  barberName: string;
  onCreated?: () => void;
};

type Conflict = { appointment_date: string; appointment_time: string; client_name: string };

const longDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

// "Me voy de viaje": bloquea días completos de un rango. Cada día queda como un bloqueo
// de día completo, así la reserva online y la agenda lo respetan sin cambios.
export const TripDialog = ({ open, onOpenChange, barberId, barberName, onCreated }: Props) => {
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("De viaje");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setRange(undefined); setReason("De viaje"); setConflicts([]); }
  }, [open]);

  const from = range?.from;
  const to = range?.to ?? range?.from;
  const days = from && to ? datesInRange(from, to) : [];

  // Turnos ya reservados en esos días: hay que avisar a esos clientes
  useEffect(() => {
    if (!from || !to) { setConflicts([]); return; }
    supabase.from("appointments")
      .select("appointment_date, appointment_time, client_name")
      .eq("barber_id", barberId)
      .neq("status", "cancelado")
      .gte("appointment_date", toISODate(from))
      .lte("appointment_date", toISODate(to))
      .order("appointment_date").order("appointment_time")
      .then(({ data }) => setConflicts((data ?? []) as Conflict[]));
  }, [barberId, from, to]);

  const submit = async () => {
    if (!from || !to) return toast.error("Elegí los días en el calendario");
    if (days.length > MAX_DAYS) return toast.error(`Máximo ${MAX_DAYS} días por viaje`);
    setBusy(true);
    const already = await getFullDayBlockedDates(barberId, days[0], days[days.length - 1]);
    const { data: userData } = await supabase.auth.getUser();
    const rows = days.filter(d => !already.has(d)).map(d => ({
      barber_id: barberId, block_date: d, start_time: null, end_time: null,
      reason: reason.trim() || "De viaje", created_by: userData.user?.id ?? null,
    }));
    const { error } = rows.length ? await supabase.from("barber_blocks").insert(rows) : { error: null };
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${barberName} no va a estar disponible ${days.length === 1 ? "ese día" : `esos ${days.length} días`}`);
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" /> Me voy de viaje
          </DialogTitle>
          <DialogDescription>
            Tocá el primer y el último día que {barberName} no va a estar. Los clientes van a ver esos días en rojo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-secondary/30 p-2 flex justify-center">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            disabled={d => d < new Date(new Date().toDateString())}
            locale={es}
            className="pointer-events-auto"
          />
        </div>

        <p className="text-sm text-center">
          {from && to
            ? <>Del <b>{longDate(days[0])}</b> al <b>{longDate(days[days.length - 1])}</b> · {days.length} {days.length === 1 ? "día" : "días"}</>
            : <span className="text-muted-foreground">Todavía no elegiste días</span>}
        </p>

        <div>
          <Label>Motivo</Label>
          <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={80} />
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1.5">
            <p className="flex items-center gap-1.5 font-medium text-warning">
              <AlertTriangle className="h-4 w-4" /> Ya hay {conflicts.length} {conflicts.length === 1 ? "turno reservado" : "turnos reservados"} en esos días
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-28 overflow-y-auto">
              {conflicts.map((c, i) => (
                <li key={i}>{longDate(c.appointment_date)} {formatTime(c.appointment_time)} · {c.client_name}</li>
              ))}
            </ul>
            <p className="text-xs">No se cancelan solos: avisales y reprogramalos desde Turnos.</p>
          </div>
        )}

        <Button variant="gold" className="w-full" onClick={submit} disabled={busy || !from}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plane className="h-4 w-4" /> Bloquear esos días</>}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
