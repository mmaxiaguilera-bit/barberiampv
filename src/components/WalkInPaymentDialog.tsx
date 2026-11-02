import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientPicker, PickedClient } from "@/components/loyalty/ClientPicker";
import { Barber, toISODate } from "@/lib/booking";
import { PAYMENT_METHODS, paymentMethodIcon, paymentMethodLabel, PaymentMethod } from "@/lib/cash";
import { loyaltyErrorMessage } from "@/lib/loyalty";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  date: Date;
  barbers: Barber[];
  onClose: () => void;
  // Si viene un cliente (desde su ficha) queda fijo y la visita suma a su tarjeta
  client?: PickedClient | null;
}

// Cobro sin turno. Con cliente: cobro + visita en una sola operación del backend
// (idempotente por paymentId: reintentos o doble clic no duplican).
export const WalkInPaymentDialog = ({ date, barbers, onClose, client: fixedClient }: Props) => {
  const { user } = useAuth();
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? "");
  const [serviceName, setServiceName] = useState("");
  const [clientName, setClientName] = useState("");
  const [client, setClient] = useState<PickedClient | null>(fixedClient ?? null);
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [busy, setBusy] = useState(false);
  const [paymentId] = useState(() => crypto.randomUUID());

  const submit = async () => {
    if (!barberId || !serviceName.trim() || !amount) return toast.error("Completá los campos");
    const amt = Number(amount), tp = Number(tip);
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Monto inválido");
    setBusy(true);
    if (client) {
      const { error } = await supabase.rpc("staff_register_walk_in", {
        _payment_id: paymentId, _client_id: client.id, _barber_id: barberId, _service_name: serviceName.trim(),
        _amount: amt, _tip: tp || 0, _method: method, _payment_date: toISODate(date),
      });
      setBusy(false);
      if (error) return toast.error(loyaltyErrorMessage(error));
      toast.success("Cobro registrado · visita sumada a la tarjeta");
      return onClose();
    }
    const { error } = await supabase.from("payments").insert({
      id: paymentId,
      barber_id: barberId,
      service_name: serviceName.trim(),
      client_name: clientName.trim() || null,
      amount: amt, tip: tp || 0,
      payment_method: method,
      payment_date: toISODate(date),
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "Este cobro ya estaba registrado" : error.message);
    toast.success("Cobro registrado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-serif text-2xl">Cobrar cliente sin turno</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Barbero</Label>
          <Select value={barberId} onValueChange={setBarberId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cliente {fixedClient ? "" : <span className="text-muted-foreground font-normal">(opcional: elegilo para sumar la visita)</span>}</Label>
          <div className="mt-1.5">
            {fixedClient ? (
              <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">{fixedClient.first_name} {fixedClient.last_name ?? ""}</div>
            ) : (
              <ClientPicker value={client} onChange={setClient} />
            )}
          </div>
          {!client && (
            <Input className="mt-2" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="O solo el nombre, sin sumar visita" />
          )}
        </div>
        <div><Label>Servicio</Label><Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Corte" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Monto</Label><Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Propina</Label><Input type="number" min={0} step="0.01" value={tip} onChange={e => setTip(e.target.value)} /></div>
        </div>
        <div>
          <Label>Método</Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={cn("py-2 rounded-md text-xs border", method === m ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 border-border")}>
                {paymentMethodIcon(m)} {paymentMethodLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
        </Button>
      </div>
    </DialogContent>
  );
};
