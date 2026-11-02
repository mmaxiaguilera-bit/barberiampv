import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { LOYALTY_START_LABEL, loyaltyNotStarted, loyaltyProgress } from "@/lib/loyalty";
import { Check, Gift } from "lucide-react";

interface Props {
  name: string;
  cycleVisits: number;
  visitsRequired: number;
  rewardDescription: string;
  isDemo?: boolean;
  compact?: boolean;
}

export const StampCard = ({ name, cycleVisits, visitsRequired, rewardDescription, isDemo, compact }: Props) => {
  const p = loyaltyProgress(cycleVisits, visitsRequired);
  const cols = visitsRequired <= 6 ? visitsRequired : visitsRequired <= 10 ? 5 : 6;
  // En fichas del personal los sellos van chicos y en una sola tira
  const gridColumns = compact
    ? `repeat(${Math.min(visitsRequired, 10)}, minmax(0, 1.75rem))`
    : `repeat(${cols}, minmax(0, 1fr))`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-[hsl(0_0%_10%)] via-[hsl(0_0%_6%)] to-[hsl(38_30%_10%)] shadow-[var(--shadow-gold)]",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-luxury text-primary">Tarjeta de fidelidad</p>
          <p className={cn("font-serif truncate", compact ? "text-lg" : "text-2xl")}>{name}</p>
        </div>
        <Logo size={compact ? 28 : 36} />
      </div>

      <div
        className={cn("relative grid", compact ? "my-3 gap-1.5" : "my-5 gap-2 sm:gap-3")}
        style={{ gridTemplateColumns: gridColumns }}
        role="img"
        aria-label={`${p.stamps} de ${visitsRequired} visitas`}
      >
        {Array.from({ length: visitsRequired }, (_, i) => {
          const filled = i < p.stamps;
          const last = i === visitsRequired - 1;
          return (
            <div
              key={i}
              className={cn(
                "aspect-square rounded-full border flex items-center justify-center transition-colors",
                filled ? "bg-gradient-to-br from-primary to-[hsl(38_65%_50%)] border-primary text-primary-foreground"
                  : "border-primary/30 bg-background/40 text-primary/40",
              )}
            >
              {filled ? <Check className="h-1/2 w-1/2 animate-in zoom-in-50 fade-in duration-300" strokeWidth={3} /> : last ? <Gift className="h-1/2 w-1/2" /> : null}
            </div>
          );
        })}
      </div>

      <div className="relative flex items-end justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Premio</p>
          <p className="text-foreground truncate">{rewardDescription}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-serif text-xl text-primary leading-none">{p.stamps}/{visitsRequired}</p>
          <p className="text-[10px] uppercase tracking-[0.02em] text-muted-foreground mt-1">visitas</p>
        </div>
      </div>
      {loyaltyNotStarted() && (
        <p className="relative mt-3 text-[11px] text-primary border border-primary/30 rounded-md px-2 py-1 bg-primary/5">
          La tarjeta empieza a sumar visitas el {LOYALTY_START_LABEL}.
        </p>
      )}
      {isDemo && (
        <p className="relative mt-3 text-[11px] text-amber-300/90 border border-amber-300/30 rounded-md px-2 py-1 bg-amber-300/5">
          Programa de demostración: las condiciones reales las define MVP Barber.
        </p>
      )}
    </div>
  );
};
