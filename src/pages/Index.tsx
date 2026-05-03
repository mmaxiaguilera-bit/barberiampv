import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingDialog } from "@/components/BookingDialog";
import { Service, Barber, formatPrice } from "@/lib/booking";
import { Scissors, MapPin, Clock, Instagram, Phone, Star } from "lucide-react";
import hero from "@/assets/hero-barbershop.jpg";
import logo from "@/assets/mvp-logo.png";

const Index = () => {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("services").select("*").eq("active", true).order("display_order"),
        supabase.from("barbers").select("*").eq("active", true).order("display_order"),
      ]);
      setServices(s ?? []);
      setBarbers(b ?? []);
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <img
          src={hero}
          alt="Interior premium de MVP Barber"
          width={1920}
          height={1280}
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />
        <div className="relative container px-4 py-20 sm:py-32 md:py-40 text-center max-w-3xl mx-auto">
          <img src={logo} alt="" width={96} height={96} className="mx-auto mb-6 w-20 sm:w-24 h-auto" />
          <p className="text-primary text-xs sm:text-sm tracking-luxury uppercase mb-4">Premium Barber Studio</p>
          <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl text-foreground mb-6 leading-[1.05]">
            El arte del corte, <br />
            <span className="text-gold-gradient italic">redefinido.</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto mb-10">
            En <strong className="text-foreground">MVP Barber</strong> combinamos técnica, estilo y atención personalizada.
            Reservá tu turno online en segundos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="gold" size="xl" onClick={() => setOpen(true)} className="uppercase tracking-wider">
              <Scissors className="h-5 w-5" /> Reservar turno
            </Button>
            <Button variant="outline" size="xl" asChild className="uppercase tracking-wider">
              <a href="#servicios">Ver servicios</a>
            </Button>
          </div>
          <div className="flex items-center justify-center gap-1 mt-6 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <Star className="h-4 w-4 fill-primary text-primary" />
            <Star className="h-4 w-4 fill-primary text-primary" />
            <Star className="h-4 w-4 fill-primary text-primary" />
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="ml-2">+200 clientes satisfechos</span>
          </div>
        </div>
      </section>

      {/* SERVICIOS */}
      <section id="servicios" className="py-20 sm:py-28 container px-4">
        <div className="text-center mb-14">
          <p className="text-primary text-xs tracking-luxury uppercase mb-3">Nuestros servicios</p>
          <h2 className="font-serif text-4xl sm:text-5xl mb-4">Hecho a tu medida</h2>
          <div className="gold-divider" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {services.map(s => (
            <article key={s.id} className="luxury-card p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-serif text-xl">{s.name}</h3>
                <Scissors className="h-5 w-5 text-primary opacity-60" />
              </div>
              <p className="text-sm text-muted-foreground mb-5 min-h-[3em]">{s.description}</p>
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {s.duration_minutes} min
                </span>
                <span className="text-primary font-semibold text-lg">{formatPrice(s.price)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* BARBEROS */}
      <section className="py-20 sm:py-28 bg-card/40 border-y border-border">
        <div className="container px-4">
          <div className="text-center mb-14">
            <p className="text-primary text-xs tracking-luxury uppercase mb-3">El equipo</p>
            <h2 className="font-serif text-4xl sm:text-5xl mb-4">Nuestros barberos</h2>
            <div className="gold-divider" />
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {barbers.map(b => (
              <div key={b.id} className="text-center">
                <div className="mx-auto w-32 h-32 rounded-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent border border-primary/30 flex items-center justify-center font-serif text-5xl text-primary mb-4">
                  {b.name[0]}
                </div>
                <h3 className="font-serif text-2xl mb-1">{b.name}</h3>
                <p className="text-sm text-muted-foreground">{b.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UBICACION */}
      <section id="ubicacion" className="py-20 sm:py-28 container px-4">
        <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto items-center">
          <div>
            <p className="text-primary text-xs tracking-luxury uppercase mb-3">Visitanos</p>
            <h2 className="font-serif text-4xl sm:text-5xl mb-6">Rada Tilly</h2>
            <div className="space-y-4 text-muted-foreground">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-foreground">Av. Francisco Seguí 1157</div>
                  <div className="text-sm">Rada Tilly, Chubut, Argentina</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-foreground">Martes a Sábado</div>
                  <div className="text-sm">10:00 — 20:00</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Instagram className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <a href="https://instagram.com/mvpbarber_" target="_blank" rel="noreferrer" className="hover:text-primary">@mvpbarber_</a>
              </div>
            </div>
            <Button variant="gold" size="lg" onClick={() => setOpen(true)} className="mt-8">
              <Scissors className="h-4 w-4" /> Reservar mi turno
            </Button>
          </div>
          <div className="aspect-square rounded-2xl overflow-hidden border border-border luxury-card p-0">
            <iframe
              title="Ubicación MVP Barber"
              src="https://www.google.com/maps?q=Av.+Francisco+Seguí+1157,+Rada+Tilly,+Chubut,+Argentina&output=embed"
              className="w-full h-full grayscale contrast-125 opacity-80"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-xs text-muted-foreground">
        <div className="container px-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
              <span>© {new Date().getFullYear()} MVP Barber · CUIT 20-46981513-8</span>
              <span className="hidden sm:inline text-border">|</span>
              <span>Av. Francisco Seguí 1157, Rada Tilly, Chubut</span>
              <span className="hidden sm:inline text-border">|</span>
              <a href="mailto:contacto@barberiampv.com" className="hover:text-primary transition-colors">contacto@barberiampv.com</a>
            </div>
            <a href="/auth" className="text-muted-foreground/60 hover:text-primary transition-colors">Staff</a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-border/40">
            <Link to="/privacidad" className="hover:text-primary transition-colors">Política de Privacidad</Link>
            <span className="text-border">·</span>
            <Link to="/terminos" className="hover:text-primary transition-colors">Términos y Condiciones</Link>
          </div>
        </div>
      </footer>

      <BookingDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};

export default Index;
