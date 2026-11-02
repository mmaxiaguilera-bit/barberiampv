import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { BUSINESS, LEGAL_UPDATED_AT } from "@/lib/legal";

// Estructura común de Términos, Privacidad y Cookies
export const LegalPage = ({ title, version, children }: { title: string; version?: string; children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1 container px-4 py-16 max-w-3xl mx-auto">
      <h1 className="font-serif text-4xl mb-2">{title}</h1>
      <p className="text-muted-foreground text-sm mb-10">
        Última actualización: {LEGAL_UPDATED_AT}{version && <> · Versión {version}</>}
      </p>
      <div className="space-y-8 text-muted-foreground leading-relaxed">{children}</div>
      <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-4 text-sm">
        <Link to="/" className="text-primary hover:underline">← Volver al inicio</Link>
        <Link to="/terminos" className="hover:text-primary">Términos y condiciones</Link>
        <Link to="/privacidad" className="hover:text-primary">Privacidad</Link>
        <Link to="/cookies" className="hover:text-primary">Cookies</Link>
      </div>
    </main>
    <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
      <div className="container px-4">
        <span>© {new Date().getFullYear()} {BUSINESS.name} · CUIT {BUSINESS.cuit} · Rada Tilly, Chubut</span>
      </div>
    </footer>
  </div>
);

export const Section = ({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-24">
    <h2 className="font-serif text-xl text-foreground mb-3">{title}</h2>
    <div className="space-y-3">{children}</div>
  </section>
);

export const Strong = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-foreground">{children}</strong>
);

export const MailLink = () => (
  <a href={`mailto:${BUSINESS.email}`} className="text-primary hover:underline">{BUSINESS.email}</a>
);
