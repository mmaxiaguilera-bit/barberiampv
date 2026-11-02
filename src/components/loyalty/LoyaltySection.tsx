import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { StampCard } from "./StampCard";
import { formatStartLabel, loyaltyNotStarted, milestoneVisits } from "@/lib/loyalty";
import { Gift, Scissors, UserPlus } from "lucide-react";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

// Sección de la portada que presenta la tarjeta con las condiciones vigentes del programa
export const LoyaltySection = ({ hasSession, onJoin }: { hasSession: boolean; onJoin: () => void }) => {
  const [program, setProgram] = useState<Program | null>(null);
  const { settings: loyaltySettings } = useLoyaltySettings();

  useEffect(() => {
    supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle().then(({ data }) => setProgram(data));
  }, []);

  // Pausada desde Admin → Tarjeta: la sección no se muestra
  if (!program || !loyaltySettings.enabled) return null;

  const required = program.visits_required;
  const steps = [
    { icon: UserPlus, title: "Creá tu tarjeta", text: "Con tu nombre y tu email. Sin apps ni contraseñas." },
    { icon: Scissors, title: "Sumá un sello en cada visita", text: "Cada vez que te atendemos, se suma solo a tu tarjeta." },
    { icon: Gift, title: `Completá ${required} y ganá`, text: program.reward_description },
  ];

  return (
    <section id="fidelidad" className="relative overflow-hidden py-20 sm:py-28">
      <div className="absolute inset-0 bg-[image:var(--gradient-gold-soft)] pointer-events-none" aria-hidden />
      <div className="relative container px-4">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 max-w-5xl mx-auto items-center">
          <div className="order-2 md:order-1 min-w-0">
            <p className="text-primary text-xs tracking-luxury uppercase mb-3">Tarjeta de fidelidad</p>
            <h2 className="font-serif text-4xl sm:text-5xl mb-4">Tu fidelidad tiene premio</h2>
            <p className="text-muted-foreground mb-8">
              Cada visita a MVP Barber suma. Llevá tu tarjeta en el celular y seguí tu progreso cuando quieras.
            </p>
            <ol className="space-y-5 mb-8">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <div className="relative flex-shrink-0 w-11 h-11 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center text-primary">
                    <s.icon className="h-5 w-5" />
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="font-medium">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="gold" size="lg" onClick={onJoin} className="uppercase tracking-[0.02em] w-full sm:w-auto">
              <Gift className="h-5 w-5" /> {hasSession ? "Ver mi tarjeta" : "Crear mi tarjeta gratis"}
            </Button>
            {loyaltyNotStarted(loyaltySettings.startsOn) && (
              <p className="text-xs text-primary mt-4">Empieza a sumar visitas el {formatStartLabel(loyaltySettings.startsOn)}.</p>
            )}
          </div>

          <div className="order-1 md:order-2 relative min-w-0">
            <div className="absolute -inset-6 rounded-full bg-primary/15 blur-3xl" aria-hidden />
            <div className="relative md:rotate-[-4deg] md:hover:rotate-0 transition-transform duration-500 max-w-sm mx-auto">
              <StampCard
                name="Tu nombre"
                cycleVisits={Math.max(0, required - 3)}
                visitsRequired={required}
                rewardDescription={program.reward_description} milestones={milestoneVisits(program.milestones)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
