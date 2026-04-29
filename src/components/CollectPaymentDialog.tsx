import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHODS, paymentMethodIcon, paymentMethodLabel, PaymentMethod } from "@/lib/cash";
import { toISODate } from "@/lib/booking";
import { Database } from "@/integrations/supabase/types";
import { Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Appt = Database["public"]["Tables"]["appointments"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: Appt;
  onPaid: () => void;
}

export const CollectPaymentDialog = ({ open, onOpenChange, appointment, onPaid }: Props) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState<string>("");
  const [tip, setTip] = useState<string>("0");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(Number(appointment.service_price) || 0));
      setTip("0");
      setMethod("efectivo");
      setNotes("");
    }
  }, [open, appointment]);

  const submit = async () => {
    const amt = Number(amount);
    const tp = Number(tip);
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Monto inválido");
    if (!Number.isFinite(tp) || tp < 0) return toast.error("Propina inválida");

    setBusy(true);
    // 1) Mark appointment as attended
    const { error: e1 } = await supabase.from("appointments")
      .update({ status: "atendido" }).eq("id", appointment.id);
    if (e1) { setBusy(false); return toast.error(e1.message); }

    // 2) Insert payment
    const { error: e2 } = await supabase.from("payments").insert({
      appointment_id: appointment.id,
      barber_id: appointment.barber_id,
      service_name: appointment.service_name,
      client_name: appointment.client_name,
      amount: amt,
      tip: tp,
      payment_method: method,
      payment_date: appointment.appointment_date,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success("Cobro registrado");
    onPaid();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Registrar cobro
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-md bg-secondary/30 border border-border text-sm">
            <div className="font-medium">{appointment.client_name}</div>
            <div className="text-xs text-muted-foreground">{appointment.service_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto</Label>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Propina</Label>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={tip} onChange={e => setTip(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Método de pago</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "py-2 px-2 rounded-md text-xs border transition-colors flex flex-col items-center gap-1",
                    method === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/30 border-border hover:border-primary/40"
                  )}
                >
                  <span className="text-base">{paymentMethodIcon(m)}</span>
                  {paymentMethodLabel(m)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Notas (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} />
          </div>

          <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cobrar y marcar atendido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
