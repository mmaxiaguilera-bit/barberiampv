import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { StampCard } from "./StampCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { loyaltyErrorMessage } from "@/lib/loyalty";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Reward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];
type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

interface Props {
  clientId: string;
  name: string;
  appointmentId?: string;
  compact?: boolean;
  // Cambia cuando el padre sabe que hubo movimientos (cobro, corrección)
  refreshKey?: number;
  onChanged?: () => void;
}

export const ClientLoyaltyPanel = ({ clientId, name, appointmentId, compact, refreshKey, onChanged }: Props) => {
  const [program, setProgram] = useState<Program | null>(null);
  const [cycle, setCycle] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [toRedeem, setToRedeem] = useState<Reward | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, a, r] = await Promise.all([
      supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle(),
      supabase.from("loyalty_accounts").select("cycle_visits").eq("client_id", clientId).maybeSingle(),
      supabase.from("loyalty_rewards").select("*").eq("client_id", clientId).eq("status", "available").order("earned_at"),
    ]);
    setProgram(p.data);
    setCycle(a.data?.cycle_visits ?? 0);
    setRewards(r.data ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const redeem = async () => {
    if (!toRedeem) return;
    setBusy(true);
    const { error } = await supabase.rpc("redeem_reward", {
      _reward_id: toRedeem.id, _note: note.trim() || undefined, _appointment_id: appointmentId,
    });
    setBusy(false);
    setToRedeem(null);
    setNote("");
    if (error) toast.error(loyaltyErrorMessage(error));
    else toast.success("Premio canjeado");
    load();
    onChanged?.();
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  if (!program) return <p className="text-xs text-muted-foreground">El programa de fidelidad no está activo.</p>;

  return (
    <div className="space-y-3">
      <StampCard
        name={name} cycleVisits={cycle} visitsRequired={program.visits_required}
        rewardDescription={program.reward_description} isDemo={program.is_demo} compact={compact}
      />
      {rewards.map(r => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/10 p-3">
          <Gift className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{r.reward_description}</p>
            <p className="text-[11px] text-muted-foreground">Ganado el {new Date(r.earned_at).toLocaleDateString("es-AR")}</p>
          </div>
          <Button size="sm" variant="gold" onClick={() => setToRedeem(r)}>Canjear</Button>
        </div>
      ))}

      <AlertDialog open={!!toRedeem} onOpenChange={o => { if (!o && !busy) setToRedeem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Canjear el premio?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRedeem?.reward_description} para {name}. Confirmalo solo cuando el cliente lo esté usando: el canje no se puede repetir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={2} placeholder="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); redeem(); }} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar canje"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
