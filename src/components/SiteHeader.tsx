import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, User as UserIcon, CalendarSearch } from "lucide-react";

export const SiteHeader = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <Logo withText />
        </Link>
        <nav className="flex items-center gap-2">
          <a href="#servicios" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors px-3">
            Servicios
          </a>
          <a href="#ubicacion" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors px-3">
            Ubicación
          </a>
          <Link to="/mi-turno" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3">
            <CalendarSearch className="h-3.5 w-3.5" /> Mi turno
          </Link>
          {user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(role === "admin" ? "/admin" : "/panel")}
              >
                <UserIcon className="h-4 w-4" /> Panel
              </Button>
              <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate("/"); }}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
};
