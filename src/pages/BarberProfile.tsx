import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingDialog } from "@/components/BookingDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { portfolioUrl } from "@/lib/portfolio";
import { ArrowLeft, ChevronLeft, ChevronRight, Scissors, Images } from "lucide-react";

type Barber = Database["public"]["Tables"]["barbers"]["Row"];
type Photo = Database["public"]["Tables"]["barber_portfolio"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BarberProfile = () => {
  const { slug = "" } = useParams();
  const [barber, setBarber] = useState<Barber | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setState("loading");
      const { data: b } = await supabase.from("barbers").select("*")
        .eq(UUID_RE.test(slug) ? "id" : "slug", slug).eq("active", true).maybeSingle();
      if (!b) { setState("missing"); return; }
      const { data: p } = await supabase.from("barber_portfolio").select("*").eq("barber_id", b.id)
        .order("display_order").order("created_at", { ascending: false });
      setBarber(b);
      setPhotos(p ?? []);
      setState("ready");
      document.title = `${b.name} — MVP Barber`;
    })();
  }, [slug]);

  const step = (d: number) => setViewing(v => (v === null ? v : (v + d + photos.length) % photos.length));

  useEffect(() => {
    if (viewing === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const firstName = barber?.name.split(/[\s(]/)[0] ?? "";

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader onBook={() => setBookingOpen(true)} />
      <main className="flex-1">
        {state === "loading" ? (
          <div className="container px-4 py-16 max-w-5xl mx-auto space-y-6">
            <Skeleton className="h-32 w-32 rounded-full mx-auto" />
            <Skeleton className="h-10 w-64 mx-auto" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
          </div>
        ) : state === "missing" ? (
          <div className="container px-4 py-24 text-center space-y-4">
            <h1 className="font-serif text-3xl">No encontramos a este barbero</h1>
            <Button variant="goldOutline" asChild><Link to="/#equipo">Ver el equipo</Link></Button>
          </div>
        ) : barber && (
          <>
            {/* Presentación */}
            <section className="relative overflow-hidden border-b border-border">
              <div className="absolute inset-0 bg-[image:var(--gradient-gold-soft)]" aria-hidden />
              <div className="relative container px-4 pt-8 pb-14 sm:pb-20 max-w-3xl mx-auto text-center">
                <Link to="/#equipo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 self-start">
                  <ArrowLeft className="h-4 w-4" /> Volver al equipo
                </Link>
                <div className="mx-auto w-32 h-32 sm:w-40 sm:h-40 rounded-full border border-primary/40 overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-transparent flex items-center justify-center font-serif text-6xl text-primary mb-6 shadow-[var(--shadow-gold)]">
                  {barber.photo_url ? <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover" /> : barber.name[0]}
                </div>
                <p className="text-primary text-xs tracking-luxury uppercase mb-3">Barbero MVP</p>
                <h1 className="font-serif text-4xl sm:text-6xl mb-4">{barber.name}</h1>
                {barber.bio && <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto mb-8">{barber.bio}</p>}
                <Button variant="gold" size="xl" onClick={() => setBookingOpen(true)} className="uppercase tracking-[0.02em]">
                  <Scissors className="h-5 w-5" /> Reservar con {firstName}
                </Button>
              </div>
            </section>

            {/* Galería */}
            <section className="container px-4 py-16 sm:py-20 max-w-5xl mx-auto">
              <div className="text-center mb-10">
                <p className="text-primary text-xs tracking-luxury uppercase mb-3">Portfolio</p>
                <h2 className="font-serif text-3xl sm:text-4xl mb-4">Sus mejores cortes</h2>
                <div className="gold-divider" />
              </div>
              {photos.length === 0 ? (
                <div className="luxury-card p-10 text-center max-w-md mx-auto">
                  <Images className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Muy pronto vas a ver acá los trabajos de {firstName}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
                  {photos.map((p, i) => (
                    <button key={p.id} onClick={() => setViewing(i)} className="group relative aspect-[4/5] rounded-lg overflow-hidden border border-border bg-secondary/30">
                      <img src={portfolioUrl(p.image_path)} alt={p.caption ?? `Corte de ${barber.name}`} loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      {p.caption && (
                        <span className="absolute inset-x-0 bottom-0 p-2 sm:p-3 text-left text-xs sm:text-sm bg-gradient-to-t from-black/80 to-transparent">{p.caption}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Cierre */}
            <section className="border-t border-border bg-card/40">
              <div className="container px-4 py-14 text-center">
                <h2 className="font-serif text-3xl sm:text-4xl mb-3">¿Te gustó su estilo?</h2>
                <p className="text-muted-foreground mb-8">Reservá tu turno con {firstName} en segundos.</p>
                <Button variant="gold" size="xl" onClick={() => setBookingOpen(true)} className="uppercase tracking-[0.02em]">
                  <Scissors className="h-5 w-5" /> Reservar con {firstName}
                </Button>
              </div>
            </section>
          </>
        )}
      </main>

      {barber && <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} initialBarberId={barber.id} />}

      <Dialog open={viewing !== null} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl p-2 sm:p-3 bg-card rounded-xl">
          <DialogTitle className="sr-only">Foto del corte</DialogTitle>
          {viewing !== null && photos[viewing] && (
            <div className="relative">
              <img src={portfolioUrl(photos[viewing].image_path)} alt={photos[viewing].caption ?? "Corte"} className="w-full max-h-[78vh] object-contain rounded-lg" />
              {photos[viewing].caption && <p className="text-sm text-center mt-2 text-muted-foreground">{photos[viewing].caption}</p>}
              {photos.length > 1 && (
                <>
                  <button onClick={() => step(-1)} aria-label="Anterior" className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background"><ChevronLeft className="h-5 w-5" /></button>
                  <button onClick={() => step(1)} aria-label="Siguiente" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
              <Button variant="gold" className="w-full mt-3" onClick={() => { setViewing(null); setBookingOpen(true); }}>
                <Scissors className="h-4 w-4" /> Quiero este corte: reservar con {firstName}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BarberProfile;
