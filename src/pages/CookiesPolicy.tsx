import { Link } from "react-router-dom";
import { LegalPage, Section, Strong } from "@/components/LegalPage";

// Inventario real del sitio (revisado en docs/LEGAL.md). Si se agrega una herramienta
// de analítica, publicidad o un contenido de terceros, actualizar esta tabla y evaluar
// si hace falta pedir consentimiento antes de cargarla.
const ITEMS: { name: string; type: string; purpose: string; duration: string; when: string }[] = [
  {
    name: "sb-…-auth-token",
    type: "Almacenamiento local (localStorage), propio",
    purpose: "Mantener abierta tu sesión de la tarjeta de fidelidad o del panel del personal",
    duration: "Hasta que cerrás sesión",
    when: "Solo si iniciás sesión",
  },
  {
    name: "mvp_loyalty_pending_signup",
    type: "Almacenamiento local (localStorage), propio",
    purpose: "Guardar los datos del alta de la tarjeta mientras verificás tu email",
    duration: "Se borra al crear la tarjeta o, como máximo, a las 24 h",
    when: "Solo si empezás a crear la tarjeta",
  },
  {
    name: "mvp_loyalty_invite_dismissed",
    type: "Almacenamiento local (localStorage), propio",
    purpose: "Recordar que cerraste el anuncio de la tarjeta para no volver a mostrártelo",
    duration: "Hasta que borres los datos del navegador",
    when: "Solo si cerrás el anuncio",
  },
];

const CookiesPolicy = () => (
  <LegalPage title="Política de Cookies">
    <Section title="1. Qué usamos">
      <p>
        Este sitio <Strong>no usa cookies de analítica, de publicidad ni de seguimiento</Strong>. Solo guarda en tu
        navegador lo necesario para que funcione lo que pedís:
      </p>
      <div className="space-y-3">
        {ITEMS.map(i => (
          <div key={i.name} className="rounded-lg border border-border p-4 text-sm space-y-1">
            <p className="text-foreground text-xs break-all">{i.name}</p>
            <p><span className="text-foreground/80">Tipo:</span> {i.type}</p>
            <p><span className="text-foreground/80">Para qué:</span> {i.purpose}</p>
            <p><span className="text-foreground/80">Duración:</span> {i.duration}</p>
            <p><span className="text-foreground/80">Cuándo se crea:</span> {i.when}</p>
          </div>
        ))}
      </div>
      <p>
        Como son necesarios para el funcionamiento y no se usan para otra cosa, no te pedimos que los aceptes. Las
        tipografías del sitio se sirven desde nuestro propio servidor.
      </p>
    </Section>

    <Section title="2. Mapa de Google">
      <p>
        En la sección "Visitanos" el mapa <Strong>no se carga hasta que tocás "Ver mapa aquí"</Strong>. Al cargarlo,
        tu navegador se conecta con Google, que puede guardar sus propias cookies según su{" "}
        <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noreferrer" className="text-primary hover:underline">política de privacidad</a>.
        Si preferís evitarlo, usá "Abrir en Google Maps" o la dirección escrita.
      </p>
    </Section>

    <Section title="3. Cómo borrarlos">
      <p>
        Podés borrar estos datos desde la configuración de tu navegador (datos de sitios o almacenamiento). Si lo
        hacés, se cierra tu sesión y el anuncio de la tarjeta puede volver a aparecer.
      </p>
      <p>
        Más información sobre tus datos en la{" "}
        <Link to="/privacidad" className="text-primary hover:underline">política de privacidad</Link>.
      </p>
    </Section>
  </LegalPage>
);

export default CookiesPolicy;
