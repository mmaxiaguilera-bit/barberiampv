import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
import { CalendarSearch, Gift, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const linkClass = " text-xs uppercase tracking-[0.02em] text-foreground/85 hover:text-primary transition-colors whitespace-nowrap";

// Header flotante en forma de cápsula: logo a la izquierda, secciones al medio y turnos a la derecha.
// overlay: flota sobre el contenido (portada, para que la foto del hero quede por detrás);
// si no, deja su lugar reservado. onBook abre la reserva en la página actual; sin él,
// lleva a la portada con la reserva abierta.
export const SiteHeader = ({ onBook, overlay = false }: { onBook?: () => void; overlay?: boolean }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // En la portada los links son anclas; en otras páginas vuelven a la portada en esa sección
  const anchor = (id: string) => (pathname === "/" ? `#${id}` : `/#${id}`);

  const book = () => (onBook ? onBook() : navigate("/?reservar=1"));

  const sections = [
    { href: anchor("servicios"), label: "Servicios" },
    { href: anchor("equipo"), label: "Barberos" },
    { href: anchor("ubicacion"), label: "Ubicación" },
  ];

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 px-3 pt-3 sm:pt-4">
        <div className="mx-auto max-w-6xl h-16 sm:h-[4.75rem] rounded-full border border-border bg-card/80 backdrop-blur-xl shadow-[var(--shadow-elevated)] flex items-center gap-3 pl-2 pr-2 sm:pl-3 sm:pr-3">
          {/* Izquierda: solo el logo */}
          <Link to="/" aria-label="MVP Barber, inicio" className="flex-shrink-0 pl-1">
            <Logo size={52} />
          </Link>

          {/* Centro: secciones + tarjeta */}
          <nav className="hidden xl:flex flex-1 items-center justify-center gap-8">
            {sections.map(s => <a key={s.label} href={s.href} className={linkClass}>{s.label}</a>)}
            <Link to="/mi-tarjeta" className={cn(linkClass, "text-primary hover:text-primary/80 inline-flex items-center gap-1.5")}>
              <Gift className="h-4 w-4" /> Mi tarjeta
            </Link>
          </nav>

          {/* Derecha: consultar (discreto) + reservar; en pantallas chicas, tarjeta y menú */}
          <div className="flex flex-1 xl:flex-none items-center justify-end gap-2">
            <Link to="/mi-tarjeta" aria-label="Mi tarjeta de fidelidad" className="xl:hidden inline-flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-primary/10">
              <Gift className="h-4 w-4" />
            </Link>
            <Button variant="outline" asChild className="hidden md:inline-flex rounded-full h-11 sm:h-12 px-6 font-normal text-xs uppercase tracking-[0.02em] bg-transparent border-border text-foreground/85 hover:text-foreground hover:border-primary/50 hover:bg-transparent">
              <Link to="/mi-turno">Consultar turno</Link>
            </Button>
            <Button variant="gold" onClick={book} className="rounded-full h-11 sm:h-12 px-5 sm:px-7 font-medium text-xs uppercase tracking-[0.02em]">
              <span>Reservar<span className="hidden sm:inline"> turno</span></span>
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="xl:hidden rounded-full" aria-label="Abrir menú"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 flex flex-col gap-1 pt-12">
                <SheetTitle className="sr-only">Menú</SheetTitle>
                {sections.map(s => (
                  <a key={s.label} href={s.href} onClick={() => setMenuOpen(false)} className="py-3 border-b border-border text-sm uppercase tracking-[0.02em]">{s.label}</a>
                ))}
                <Link to="/mi-tarjeta" onClick={() => setMenuOpen(false)} className="py-3 border-b border-border text-sm uppercase tracking-[0.02em] text-primary flex items-center gap-2">
                  <Gift className="h-4 w-4" /> Mi tarjeta de fidelidad
                </Link>
                <Link to="/mi-turno" onClick={() => setMenuOpen(false)} className="py-3 border-b border-border text-sm uppercase tracking-[0.02em] flex items-center gap-2">
                  <CalendarSearch className="h-4 w-4 text-primary" /> Consultar mi turno
                </Link>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {/* Lugar del header cuando no flota sobre el contenido */}
      {!overlay && <div aria-hidden className="h-[4.75rem] sm:h-[5.75rem]" />}
    </>
  );
};
