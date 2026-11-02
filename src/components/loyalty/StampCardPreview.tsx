import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Logo } from "@/components/Logo";
import { formatStartLabel, loyaltyNotStarted } from "@/lib/loyalty";
import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLoyaltySettings } from "@/hooks/useLoyaltySettings";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

const STEP_MS = 650;   // entre un check y el siguiente
const HOLD_MS = 2200;  // tarjeta completa antes de reiniciar

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const useActiveProgram = () => {
  const [program, setProgram] = useState<Program | null>(null);
  useEffect(() => {
    supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle().then(({ data }) => setProgram(data));
  }, []);
  return program;
};

// Tarjeta de ejemplo al crear la tarjeta: el nombre que se está escribiendo y los
// checks que se van completando solos (en bucle).
const StampCardPreview = ({ name, program }: { name: string; program: Program }) => {
  const required = program.visits_required;
  const [visits, setVisits] = useState(0);

  useEffect(() => {
    // Sin animación si la persona la desactivó en su dispositivo: queda a mitad de camino
    if (prefersReducedMotion()) { setVisits(Math.ceil(required * 0.7)); return; }
    const t = setTimeout(() => setVisits(v => (v >= required ? 0 : v + 1)), visits >= required ? HOLD_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [visits, required]);

  const done = visits >= required;
  const cols = required <= 6 ? required : required <= 10 ? 5 : 6;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/50 bg-gradient-to-br from-[hsl(0_0%_12%)] via-[hsl(0_0%_7%)] to-[hsl(38_30%_11%)] p-5 sm:p-7 shadow-[var(--shadow-gold)]">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Tarjeta de fidelidad</p>
          <p className="font-serif text-2xl sm:text-3xl truncate mt-1">{name.trim() || "Tu nombre"}</p>
        </div>
        <Logo size={56} />
      </div>

      <div className="relative grid gap-3 sm:gap-4 my-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="img" aria-label={`${Math.min(visits, required)} de ${required} visitas`}>
        {Array.from({ length: required }, (_, i) => {
          const filled = i < visits;
          return (
            <div key={i} className={cn(
              "aspect-square rounded-full border flex items-center justify-center transition-colors duration-300",
              filled ? "bg-gradient-to-br from-primary to-[hsl(38_65%_50%)] border-primary text-primary-foreground"
                : "border-primary/40 text-primary",
            )}>
              {filled
                ? <Check className="h-2/5 w-2/5 animate-in zoom-in-50 fade-in duration-300" strokeWidth={3} />
                : i === required - 1 ? <Gift className="h-2/5 w-2/5" /> : null}
            </div>
          );
        })}
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
        <div className="min-w-0" aria-live="polite">
          <p className="font-serif text-xl sm:text-2xl leading-tight">
            <span className="text-primary text-3xl sm:text-4xl">{Math.min(visits, required)}</span> de {required} visitas
          </p>
          <p className="text-sm text-muted-foreground mt-1">{done ? "¡Tarjeta completa: ganaste tu premio!" : "Tu premio, cada vez más cerca."}</p>
        </div>
        <div className="h-14 w-px bg-border" aria-hidden />
        <div className="flex items-start gap-3 min-w-0">
          <Gift className="h-7 w-7 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary">Premio</p>
            <p className="text-sm leading-snug mt-0.5">{program.reward_description}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Pantalla de alta de la tarjeta: presentación con la tarjeta animada y los pasos a la
// izquierda, y el formulario (children) a la derecha.
export const LoyaltySignupLayout = ({ name, children }: { name: string; children: ReactNode }) => {
  const program = useActiveProgram();
  const { settings: loyaltySettings } = useLoyaltySettings();
  const required = program?.visits_required ?? 10;
  const steps = [
    { title: "Registrate", text: "Completá tus datos en pocos segundos." },
    { title: "Sumá visitas", text: "Cada vez que te atendemos se suma un check." },
    { title: "Disfrutá tu premio", text: `Al completar ${required} visitas, accedés a un beneficio exclusivo.` },
  ];

  return (
    <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-start">
      <div className="space-y-8">
        <div>
          <p className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-primary">
            Mi tarjeta MVP <span className="h-px w-8 bg-primary/60" aria-hidden />
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mt-4">
            Tu próxima visita tiene <span className="text-primary">premio.</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mt-4 max-w-md">
            Sumá visitas, disfrutá beneficios exclusivos y viví la experiencia MVP Barber.
          </p>
          {loyaltyNotStarted(loyaltySettings.startsOn) && (
            <p className="text-sm text-primary mt-3">La tarjeta empieza a sumar visitas el {formatStartLabel(loyaltySettings.startsOn)}.</p>
          )}
        </div>

        {program && <StampCardPreview name={name} program={program} />}

        <ol className="hidden sm:grid grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <li key={s.title}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-full border border-primary/60 flex items-center justify-center text-sm flex-shrink-0">{i + 1}</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <p className="font-serif text-lg mt-3">{s.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="lg:sticky lg:top-28">{children}</div>
    </div>
  );
};
