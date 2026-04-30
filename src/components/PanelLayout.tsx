import { ReactNode } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, LayoutDashboard, CalendarDays, Users, Users2, Scissors, UserCog, Wallet, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  requireRole?: "admin" | "barber" | "any";
}

export const PanelLayout = ({ children, requireRole = "any" }: Props) => {
  const { user, role, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <NoRoleScreen />;
  if (requireRole === "admin" && role !== "admin") return <Navigate to="/panel" replace />;

  const adminLinks = [
    { to: "/admin", icon: LayoutDashboard, label: "Resumen", end: true },
    { to: "/admin/turnos", icon: CalendarDays, label: "Turnos" },
    { to: "/admin/caja", icon: Wallet, label: "Caja" },
    { to: "/admin/reportes", icon: BarChart3, label: "Reportes" },
    { to: "/admin/servicios", icon: Scissors, label: "Servicios" },
    { to: "/admin/horarios", icon: Clock, label: "Horarios" },
    { to: "/admin/barberos", icon: Users, label: "Barberos" },
    { to: "/admin/clientes", icon: Users2, label: "Clientes" },
    { to: "/admin/usuarios", icon: UserCog, label: "Usuarios" },
  ];
  const barberLinks = [
    { to: "/panel", icon: CalendarDays, label: "Mis turnos", end: true },
    { to: "/admin/clientes", icon: Users2, label: "Clientes" },
  ];
  const links = role === "admin" ? adminLinks : barberLinks;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="container px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <Logo size={32} />
            <div className="hidden sm:block leading-tight">
              <div className="font-serif text-base">MVP Barber</div>
              <div className="text-[10px] text-muted-foreground tracking-luxury uppercase">{role === "admin" ? "Admin" : "Barbero"}</div>
            </div>
          </Link>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
        <nav className="container px-2 sm:px-4 flex gap-1 overflow-x-auto border-t border-border">
          {links.map(l => {
            const active = l.end ? location.pathname === l.to : location.pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="container px-3 sm:px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
};

const NoRoleScreen = () => {
  const { user, refreshRole, signOut } = useAuth();
  const navigate = useNavigate();
  const claim = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("claim_first_admin");
    if (error) return alert(error.message);
    if (data) { await refreshRole(); }
    else alert("Ya hay un administrador. Pedile que te asigne un rol.");
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card p-6 max-w-md w-full text-center space-y-4">
        <Scissors className="h-10 w-10 text-primary mx-auto" />
        <h1 className="font-serif text-2xl">Tu cuenta no tiene rol asignado</h1>
        <p className="text-sm text-muted-foreground">
          Hola {user?.email}. Pedile a un administrador que te asigne un rol (admin o barbero).
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={async () => { await signOut(); navigate("/"); }}>Salir</Button>
          <Button variant="gold" className="flex-1" onClick={claim}>Soy el primer admin</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Esta opción solo funciona si todavía no existe ningún admin en el sistema.</p>
      </div>
    </div>
  );
};
