import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["appointment_status"];

const styles: Record<Status, string> = {
  pendiente: "bg-warning/15 text-warning border-warning/30",
  confirmado: "bg-info/15 text-info border-info/30",
  atendido: "bg-success/15 text-success border-success/30",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
};
const labels: Record<Status, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  atendido: "Atendido",
  cancelado: "Cancelado",
};

export const StatusBadge = ({ status }: { status: Status }) => (
  <Badge variant="outline" className={cn("font-medium", styles[status])}>
    {labels[status]}
  </Badge>
);

export const STATUS_OPTIONS: Status[] = ["pendiente", "confirmado", "atendido", "cancelado"];
export const statusLabel = (s: Status) => labels[s];
