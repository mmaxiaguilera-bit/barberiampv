import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { toISODate } from "@/lib/booking";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  barberId: string;
  defaultDate?: Date;
  defaultStartTime?: string; // HH:MM
  defaultEndTime?: string;   // HH:MM
  defaultReason?: string;
  onCreated?: () => void;
};

export const BlockSlotDialog = ({
  open, onOpenChange, barberId, defaultDate, defaultStartTime, defaultEndTime, defaultReason, onCreated,
}: Props) => {
  const [fullDay, setFullDay] = useState(false);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(toISODate(defaultDate ?? new Date()));
      setStart(defaultStartTime ?? "");
      setEnd(defaultEndTime ?? "");
      setReason(defaultReason ?? "");
      setFullDay(!defaultStartTime);
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime, defaultReason]);

  const submit = async () => {
    if (!date) return toast.error("Elegí una fecha");
    if (!fullDay) {
      if (!start || !end) return toast.error("Indicá desde y hasta");
      if (start >= end) return toast.error("La hora de fin debe ser mayor al inicio");
    }
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("barber_blocks").insert({
      barber_id: barberId,
      block_date: date,
      start_time: fullDay ? null : start + ":00",
      end_time: fullDay ? null : end + ":00",
      reason: reason.trim() || null,
      created_by: userData.user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bloqueo creado");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Bloquear horario</DialogTitle>
          <DialogDescription>El horario no estará disponible para reservas online.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase">Fecha</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border border-border">
            <Label className="cursor-pointer">Día completo</Label>
            <Switch checked={fullDay} onCheckedChange={setFullDay} />
          </div>
          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase">Desde</Label>
                <Input type="time" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase">Hasta</Label>
                <Input type="time" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs uppercase">Motivo (opcional)</Label>
            <Input
              placeholder="Ej: Feriado, Vacaciones, Reservado por WhatsApp"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="gold" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bloquear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
