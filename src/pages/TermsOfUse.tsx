import { Link } from "react-router-dom";
import { LegalPage, MailLink, Section, Strong } from "@/components/LegalPage";
import { BUSINESS, ONLINE_CANCEL_HOURS, TERMS_VERSION } from "@/lib/legal";

// Texto versionado: si cambia el contenido, crear una versión nueva (ver docs/LEGAL.md)
const TermsOfUse = () => (
  <LegalPage title="Términos y Condiciones" version={TERMS_VERSION}>
    <Section title="1. Quiénes somos">
      <p>
        {BUSINESS.name} es una barbería que atiende en forma presencial en {BUSINESS.address}, de martes a sábado de
        10 a 20 h. CUIT <Strong>{BUSINESS.cuit}</Strong>. Contacto: <MailLink />.
      </p>
      <p>
        Estos términos explican cómo funcionan la reserva de turnos y la tarjeta de fidelidad en{" "}
        <Strong>{BUSINESS.site}</Strong>. Al reservar o crear la tarjeta te pedimos que los aceptes marcando una casilla.
      </p>
    </Section>

    <Section title="2. Qué se puede hacer en el sitio">
      <ul className="list-disc pl-5 space-y-1">
        <li>Reservar turnos para servicios que se prestan en el local: corte, barba y diseños.</li>
        <li>Consultar y cancelar tus turnos desde <Link to="/mi-turno" className="text-primary hover:underline">Mi turno</Link>.</li>
        <li>Crear y usar la tarjeta de fidelidad.</li>
      </ul>
      <p>En el sitio no se venden productos ni se hacen pagos.</p>
    </Section>

    <Section title="3. Reservas">
      <ul className="list-disc pl-5 space-y-2">
        <li>El turno queda reservado cuando confirmás el formulario y ves el mensaje "¡Turno reservado!".</li>
        <li>Solo se muestran los horarios disponibles en ese momento.</li>
        <li>Te pedimos nombre, apellido y teléfono reales, para poder identificarte y contactarte por el turno.</li>
        <li>No se cobra seña ni ningún otro cargo por reservar.</li>
      </ul>
    </Section>

    <Section title="4. Cancelaciones y cambios de horario">
      <ul className="list-disc pl-5 space-y-2">
        <li>
          Podés cancelar el turno desde <Link to="/mi-turno" className="text-primary hover:underline">Mi turno</Link>{" "}
          hasta <Strong>{ONLINE_CANCEL_HOURS} horas antes</Strong> del horario reservado. Si faltan menos de{" "}
          {ONLINE_CANCEL_HOURS} horas, avisanos directamente a la barbería.
        </li>
        <li>Cancelar no tiene ningún costo.</li>
        <li>Para cambiar el horario, cancelá el turno y reservá uno nuevo, o pedile el cambio a la barbería.</li>
        <li>Si no vas a poder venir, cancelá el turno para que otra persona pueda usar ese horario.</li>
        <li>
          Si la barbería tiene que cancelar o mover tu turno, te avisa por el teléfono o el email que dejaste, con la
          mayor anticipación posible.
        </li>
      </ul>
    </Section>

    <Section id="arrepentimiento" title="5. Derecho de revocación">
      <p>
        Como la reserva se hace a distancia, tenés derecho a revocarla dentro de los 10 días corridos desde que la
        hiciste, sin dar motivos y sin costo ni responsabilidad. Así lo establecen el art. 34 de la Ley 24.240 y el
        art. 1110 del Código Civil y Comercial, y no se puede renunciar a este derecho.
      </p>
      <p>
        Como la reserva no tiene costo, revocarla equivale a cancelarla: podés hacerlo desde{" "}
        <Link to="/mi-turno" className="text-primary hover:underline">Mi turno</Link> o escribiendo a <MailLink />.
      </p>
    </Section>

    <Section title="6. Pagos, cambios y reembolsos">
      <p>
        Los servicios se pagan en el local, en efectivo, con tarjeta, con Mercado Pago o con
        otros medios disponibles. Como el sitio no cobra, no hay reembolsos que gestionar por la web.
      </p>
      <p>
        Los precios que ves al reservar son los vigentes para cada servicio en ese momento. Las bebidas se venden solo
        en el local.
      </p>
      <p>
        Si tenés un reclamo sobre un servicio, escribinos a <MailLink /> o decínoslo en el local. Esto no limita los
        derechos que te da la Ley 24.240 de Defensa del Consumidor.
      </p>
    </Section>

    <Section id="tarjeta" title="7. Tarjeta de fidelidad">
      <ul className="list-disc pl-5 space-y-2">
        <li>Es gratuita y opcional. Para crearla necesitás un email que verificás con un código.</li>
        <li>
          Reservar no suma. Suma una visita cada vez que te atendemos en el local y el personal registra la atención,
          con o sin turno previo. Los turnos cancelados o a los que no asististe no suman.
        </li>
        <li>
          La cantidad de visitas necesarias y el premio son los que se muestran en tu tarjeta y en el sitio al momento
          de cada visita.
        </li>
        <li>
          Si cambian las reglas, conservás las visitas acumuladas y los premios que ya ganaste mantienen su beneficio.
        </li>
        <li>El personal canjea los premios en el local.</li>
        <li>Podés pedir la baja de la tarjeta y la eliminación de sus datos escribiendo a <MailLink />.</li>
        <li>
          Las promociones por email y por WhatsApp son opcionales e independientes de la tarjeta (ver{" "}
          <Link to="/privacidad" className="text-primary hover:underline">política de privacidad</Link>).
        </li>
      </ul>
    </Section>

    <Section title="8. Imágenes y contenidos">
      <p>
        Los textos, el logo, las fotos y el diseño del sitio pertenecen a sus respectivos titulares. No los
        reproduzcas sin autorización.
      </p>
    </Section>

    <Section title="9. Si el sitio no funciona">
      <p>
        Si por un problema técnico no podés reservar, ver o cancelar un turno, comunicate con la barbería y lo
        resolvemos por ese medio.
      </p>
    </Section>

    <Section title="10. Ley aplicable y reclamos">
      <p>
        Estos términos se rigen por las leyes de la República Argentina, en particular la{" "}
        <Strong>Ley 24.240 de Defensa del Consumidor</Strong> y el Código Civil y Comercial. Nada en estos términos
        limita los derechos que esas normas te reconocen como consumidor.
      </p>
      <p>
        Podés hacer consultas o reclamos a <MailLink />. También podés acudir a la autoridad de defensa del
        consumidor que corresponda.
      </p>
    </Section>
  </LegalPage>
);

export default TermsOfUse;
