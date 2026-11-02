import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { dismissInvite, isInviteDismissed } from "@/lib/loyalty";
import { LoyaltyPromoDialog } from "./LoyaltyPromoDialog";

const SHOW_AFTER_MS = 3000;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // No abrir sola si hay otra ventana abierta (ej. la reserva)
  suppress?: boolean;
}

// Anuncio de la tarjeta para visitantes sin sesión. Se abre solo una vez:
// después de cerrarlo no vuelve a aparecer en ese navegador (el botón de la portada lo sigue abriendo).
export const LoyaltyInvite = ({ open, onOpenChange, suppress }: Props) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user || suppress || isInviteDismissed()) return;
    const t = setTimeout(() => onOpenChange(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [loading, user, suppress, onOpenChange]);

  const change = (o: boolean) => {
    if (!o) dismissInvite();
    onOpenChange(o);
  };

  return <LoyaltyPromoDialog open={open && !user} onOpenChange={change} />;
};
