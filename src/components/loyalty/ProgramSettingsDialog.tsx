import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loyaltyErrorMessage } from "@/lib/loyalty";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

export const ProgramSettingsDialog = ({ open, onOpenChange, program, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; program: Program | null; onSaved: () => void;
}) => {
  const [visits, setVisits] = useState("10");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisits(String(program?.visits_required ?? 10));
    setDescription(program?.is_demo ? "" : program?.reward_description ?? "");
  }, [open, program]);

  const save = async () => {
    const n = Number(visits);
    if (!Number.isInteger(n) || n < 1 || n > 100) return toast.error("La cantidad de visitas debe ser entre 1 y 100.");
    if (description.trim().length < 3) return toast.error("Describí el beneficio.");
    if (!confirm(`¿Aplicar ${n} visitas = "${description.trim()}"? Los premios ya ganados no cambian.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_loyalty_program", { _visits_required: n, _reward_description: description.trim() });
    setBusy(false);
    if (error) return toast.error(loyaltyErrorMessage(error));
    toast.success("Programa actualizado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Programa de fidelidad</DialogTitle>
          <DialogDescription>
            {program?.is_demo ? "Está activa la configuración de demostración. Definí las condiciones reales." : `Vigente desde el ${program ? new Date(program.created_at).toLocaleDateString("es-AR") : "—"}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Visitas necesarias para un premio</Label>
            <Input type="number" min={1} max={100} value={visits} onChange={e => setVisits(e.target.value)} />
          </div>
          <div>
            <Label>Beneficio</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} placeholder="Ej: Corte gratis" />
          </div>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            <li>Los premios ya ganados conservan su beneficio original.</li>
            <li>El progreso de cada cliente se mantiene; la nueva cantidad aplica desde su próxima visita.</li>
            <li>Si bajás la cantidad y un cliente ya la superó, gana el premio en su próxima visita.</li>
            <li>El cambio queda registrado con fecha y usuario.</li>
          </ul>
          <Button variant="gold" className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar condiciones"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
