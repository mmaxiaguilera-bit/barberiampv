import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STATUS_OPTIONS, StatusBadge, statusLabel } from "./StatusBadge";
import { CollectPaymentDialog } from "./CollectPaymentDialog";
import { Database } from "@/integrations/supabase/types";
import { formatPrice, formatTime } from "@/lib/booking";
import { toast } from "sonner";
import { Phone, Calendar, Scissors, User, Trash2, Loader2, DollarSign } from "lucide-react";

type Appt = Database["public"]["Tables"]["appointments"]["Row"] & { barbers?: { name: string } | null };

interface Props {
  appointment: Appt | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
  canDelete?: boolean;
}

export const AppointmentSheet = ({ appointment, open, onOpenChange, onChanged, canDelete }: Props) => {
  const [status, setStatus] = useState<Database["public"]["Enums"]["appointment_status"]>("pendiente");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);

  useEffect(() => {
    if (appointment) {
      setStatus(appointment.status);
      setNotes(appointment.notes ?? "");
    }
  }, [appointment]);

  if (!appointment) return null;

  const alreadyAttended = appointment.status === "atendido";

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("appointments")
      .update({ status, notes: notes.trim() || null })
      .eq("id", appointment.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (status === "cancelado" && appointment.status !== "cancelado") {
      supabase.functions.invoke("send-cancellation-email", {
        body: { appointment_id: appointment.id },
      }).catch(() => {});
    }
    toast.success("Turno actualizado");
    onChanged();
    onOpenChange(false);
  };

  const handleSaveOrCollect = () => {
    // If user is changing status to "atendido" and not already attended, open collect dialog
    if (status === "atendido" && !alreadyAttended) {
      setCollectOpen(true);
    } else {
      save();
    }
  };

  const remove = async () => {
    if (!confirm("¿Eliminar este turno definitivamente?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);
    if (error) return toast.error(error.message);
    toast.success("Turno eliminado");
    onChanged();
    onOpenChange(false);
  };

  const dateStr = new Date(appointment.appointment_date + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">Turno</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={appointment.status} />
            <span className="text-xs text-muted-foreground">{new Date(appointment.created_at).toLocaleDateString("es-AR")}</span>
          </div>
          <div className="space-y-3 text-sm">
            <Row icon={User} label="Cliente" value={appointment.client_name} />
            <Row icon={Phone} label="Teléfono" value={
              <a href={`tel:${appointment.client_phone}`} className="text-primary hover:underline">{appointment.client_phone}</a>
            } />
            <Row icon={Scissors} label="Servicio" value={`${appointment.service_name} · ${formatPrice(Number(appointment.service_price))}`} />
            <Row icon={Calendar} label="Fecha y hora" value={`${dateStr} — ${formatTime(appointment.appointment_time)}`} />
            {appointment.barbers?.name && <Row icon={User} label="Barbero" value={appointment.barbers.name} />}
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Estado</label>
              <Select value={status} onValueChange={v => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Notas internas</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Preferencias, observaciones, etc." maxLength={500} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {canDelete && (
              <Button variant="outline" onClick={remove} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="gold" onClick={handleSaveOrCollect} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> :
                (status === "atendido" && !alreadyAttended) ? <><DollarSign className="h-4 w-4" /> Cobrar y guardar</> : "Guardar cambios"}
            </Button>
          </div>

          {!alreadyAttended && status !== "atendido" && (
            <Button variant="goldOutline" className="w-full" onClick={() => { setStatus("atendido"); setCollectOpen(true); }}>
              <DollarSign className="h-4 w-4" /> Cobrar ahora
            </Button>
          )}

          <a
            href={`https://wa.me/${appointment.client_phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hola ${appointment.client_name}, te confirmo tu turno en MVP Barber.`)}`}
            target="_blank" rel="noreferrer"
            className="block text-center text-sm text-primary hover:underline"
          >
            Enviar mensaje por WhatsApp
          </a>
        </div>

        <CollectPaymentDialog
          open={collectOpen}
          onOpenChange={setCollectOpen}
          appointment={appointment}
          onPaid={() => { onChanged(); onOpenChange(false); }}
        />
      </SheetContent>
    </Sheet>
  );
};

const Row = ({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
    <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground break-words">{value}</div>
    </div>
  </div>
);
