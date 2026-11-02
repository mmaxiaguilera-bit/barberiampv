import { ReactNode, useEffect, useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, LayoutDashboard, CalendarDays, Users, Users2, Scissors, UserCog, Wallet, BarChart3, Clock, CheckCircle2, Menu, Plus, Gift } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  requireRole?: "admin" | "barber" | "any";
}

export const PanelLayout = ({ children, requireRole = "any" }: Props) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Al navegar desde el menú del celular, se cierra
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <NoRoleScreen />;
  if (requireRole === "admin" && role !== "admin") return <Navigate to="/panel" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* Menú lateral fijo en compu */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <SidebarContent />
      </aside>

      {/* Barra superior en celular */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-3 flex items-center justify-between border-b border-border bg-background/90 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <Logo size={30} />
          <span className="font-serif text-base">MVP Barber</span>
        </Link>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border flex flex-col">
            <SheetTitle className="sr-only">Menú</SheetTitle>
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </header>

      <main className="lg:pl-64">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-10 py-5 sm:py-8">{children}</div>
      </main>
    </div>
  );
};

const SidebarContent = () => {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const adminLinks = [
    { to: "/admin", icon: LayoutDashboard, label: "Resumen", end: true },
    { to: "/admin/turnos", icon: CalendarDays, label: "Turnos" },
    { to: "/admin/caja", icon: Wallet, label: "Caja" },
    { to: "/admin/reportes", icon: BarChart3, label: "Reportes" },
    { to: "/admin/servicios", icon: Scissors, label: "Servicios" },
    { to: "/admin/horarios", icon: Clock, label: "Horarios" },
    { to: "/admin/barberos", icon: Users, label: "Barberos" },
    { to: "/admin/clientes", icon: Users2, label: "Clientes" },
    { to: "/admin/tarjeta", icon: Gift, label: "Tarjeta" },
    { to: "/admin/usuarios", icon: UserCog, label: "Usuarios" },
  ];
  const barberLinks = [
    { to: "/panel", icon: CalendarDays, label: "Mis turnos", end: true },
    { to: "/admin/clientes", icon: Users2, label: "Clientes" },
  ];
  const links = role === "admin" ? adminLinks : barberLinks;
  const email = user?.email ?? "";

  return (
    <div className="flex flex-col h-full p-4">
      <Link to="/" className="flex items-center gap-2.5 px-2 pt-1 pb-5">
        <Logo size={36} />
        <div className="leading-tight">
          <div className="font-serif text-lg">MVP Barber</div>
          <div className="text-[10px] text-muted-foreground tracking-luxury uppercase">{role === "admin" ? "Admin" : "Barbero"}</div>
        </div>
      </Link>

      {role === "admin" && (
        <Button variant="gold" className="w-full rounded-xl h-11 mb-5" asChild>
          <Link to="/admin/turnos?nuevo=1"><Plus className="h-4 w-4" /> Nuevo turno</Link>
        </Button>
      )}

      <nav className="flex-1 overflow-y-auto space-y-1">
        {links.map(l => {
          const active = l.end ? location.pathname === l.to : location.pathname.startsWith(l.to);
          return (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors",
                active ? "bg-sidebar-accent text-foreground font-medium" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <l.icon className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")} /> {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 pt-4 border-t border-sidebar-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[hsl(38_65%_50%)] text-primary-foreground flex items-center justify-center font-serif text-lg flex-shrink-0">
          {(email[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm truncate">{email}</div>
          <div className="text-xs text-muted-foreground">{role === "admin" ? "Administrador" : "Barbero"}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Salir" onClick={async () => { await signOut(); navigate("/"); }}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

type NoRoleState = "checking" | "no_admin" | "pending" | "no_request" | "rejected";

const NoRoleScreen = () => {
  const { user, customerId, refreshRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<NoRoleState>("checking");

  useEffect(() => {
    const check = async () => {
      const [{ data: anyAdmin }, { data: request }] = await Promise.all([
        supabase.rpc("has_any_admin"),
        supabase.from("access_requests").select("status").eq("user_id", user!.id).maybeSingle(),
      ]);

      if (!anyAdmin) { setState("no_admin"); return; }
      if (!request) { setState("no_request"); return; }
      setState(request.status === "pending" ? "pending" : "rejected");
    };
    check();
  }, [user]);

  const claimFirstAdmin = async () => {
    const { data, error } = await supabase.rpc("claim_first_admin");
    if (error) return alert(error.message);
    if (data) await refreshRole();
  };

  const requestAccess = async () => {
    const { error } = await supabase.from("access_requests").upsert({ user_id: user!.id, status: "pending" }, { onConflict: "user_id" });
    if (error) return alert(error.message);
    setState("pending");
  };

  const checkStatus = async () => {
    await refreshRole();
    const { data } = await supabase.from("access_requests").select("status").eq("user_id", user!.id).maybeSingle();
    if (!data) { setState("no_request"); return; }
    setState(data.status === "pending" ? "pending" : "rejected");
  };

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  // Los clientes con tarjeta no son personal: van a su panel, no a pedir acceso
  if (customerId) return <Navigate to="/mi-tarjeta" replace />;

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "no_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="luxury-card p-6 max-w-md w-full text-center space-y-4">
          <Scissors className="h-10 w-10 text-primary mx-auto" />
          <h1 className="font-serif text-2xl">Tu cuenta no tiene rol asignado</h1>
          <p className="text-sm text-muted-foreground">
            Hola {user?.email}. Todavía no hay ningún administrador en el sistema.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleSignOut}>Salir</Button>
            <Button variant="gold" className="flex-1" onClick={claimFirstAdmin}>Soy el primer admin</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Esta opción solo funciona si todavía no existe ningún admin en el sistema.</p>
        </div>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="luxury-card p-6 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
          <h1 className="font-serif text-2xl">Solicitud enviada</h1>
          <p className="text-sm text-muted-foreground">
            Tu solicitud fue enviada correctamente. El administrador la revisará pronto y te asignará un rol.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleSignOut}>Salir</Button>
            <Button variant="gold" className="flex-1" onClick={checkStatus}>Verificar estado</Button>
          </div>
        </div>
      </div>
    );
  }

  // no_request or rejected
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="luxury-card p-6 max-w-md w-full text-center space-y-4">
        <Scissors className="h-10 w-10 text-primary mx-auto" />
        <h1 className="font-serif text-2xl">Tu cuenta no tiene rol asignado</h1>
        <p className="text-sm text-muted-foreground">
          {state === "rejected"
            ? `Hola ${user?.email}. Tu solicitud anterior fue rechazada. Podés volver a solicitar acceso.`
            : `Hola ${user?.email}. Enviá una solicitud al administrador para que te asigne un rol.`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleSignOut}>Salir</Button>
          <Button variant="gold" className="flex-1" onClick={requestAccess}>Solicitar acceso</Button>
        </div>
      </div>
    </div>
  );
};
