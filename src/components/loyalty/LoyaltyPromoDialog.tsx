import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StampCard } from "./StampCard";
import { LoyaltyAccessForm } from "./LoyaltyAccessForm";
import { Check } from "lucide-react";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

// Presenta la tarjeta (con las condiciones vigentes del programa) y permite crearla ahí mismo
export const LoyaltyPromoDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    if (!open || program) return;
    supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle().then(({ data }) => setProgram(data));
  }, [open, program]);

  const required = program?.visits_required ?? 10;
  const benefits = [
    "Cada vez que te atendemos sumás un sello.",
    program ? `Con ${required} visitas ganás: ${program.reward_description}.` : null,
    "Seguí tu progreso y tus premios desde el celular.",
    "Sin apps ni contraseñas: entrás con un código que te llega por email.",
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md lg:max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-card border-primary/30 p-5 sm:p-6 lg:p-8">
        {/* En compu: presentación a la izquierda y formulario a la derecha; en celular, una sola columna */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-10 lg:items-center">
          <div className="space-y-5 min-w-0">
            <DialogHeader className="text-center sm:text-center lg:text-left">
              <p className="text-[10px] uppercase tracking-luxury text-primary">Nuevo en MVP Barber</p>
              <DialogTitle className="font-serif text-3xl">Tu tarjeta de fidelidad</DialogTitle>
              <DialogDescription>Sumá visitas cada vez que venís y ganá premios.</DialogDescription>
            </DialogHeader>

            {program && (
              <StampCard
                name="Tu nombre" cycleVisits={Math.min(3, required - 1)} visitsRequired={required}
                rewardDescription={program.reward_description} isDemo={program.is_demo} compact
              />
            )}

            <ul className="space-y-2">
              {benefits.map(b => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0 border-t border-border pt-5 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-10">
            <LoyaltyAccessForm
              showHeading={false}
              onVerified={() => { onOpenChange(false); navigate("/mi-tarjeta"); }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
