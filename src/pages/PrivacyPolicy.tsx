import { Link } from "react-router-dom";
import { LegalPage, MailLink, Section, Strong } from "@/components/LegalPage";
import { BUSINESS, PRIVACY_VERSION } from "@/lib/legal";

// Texto versionado: si cambia el contenido, crear una versión nueva (ver docs/LEGAL.md)
const PURPOSES: { what: string; data: string; basis: string; required: string }[] = [
  {
    what: "Reservar, confirmar y cancelar turnos",
    data: "Nombre, apellido, teléfono; servicio, barbero, fecha, hora y estado del turno",
    basis: "Necesarios para el servicio que pedís (art. 5, inc. 2, ap. d, Ley 25.326)",
    required: "Obligatorios: sin ellos no podemos tomar la reserva",
  },
  {
    what: "Enviarte la confirmación o la cancelación del turno por email",
    data: "Email",
    basis: "Lo dejás voluntariamente para recibir esos avisos",
    required: "Opcional: si no lo dejás, reservás igual",
  },
  {
    what: "Cobrar en el local y llevar la caja",
    data: "Servicio, importe, medio de pago y barbero (no guardamos datos de tarjetas)",
    basis: "Necesarios para el servicio y para cumplir obligaciones contables y fiscales",
    required: "Los registra el personal en el local",
  },
  {
    what: "Administrar la tarjeta de fidelidad",
    data: "Nombre, email verificado y, si los cargás, apellido, WhatsApp y cumpleaños (día y mes); visitas, premios y canjes",
    basis: "Condiciones de la tarjeta, que aceptás al crearla",
    required: "Nombre y email obligatorios; el resto es opcional",
  },
  {
    what: "Enviarte novedades, promociones y beneficios por email",
    data: "Nombre, email y, si lo cargaste, cumpleaños",
    basis: "Tu consentimiento, con una casilla separada y desmarcada",
    required: "Opcional. Podés darte de baja cuando quieras",
  },
  {
    what: "Enviarte avisos de tu tarjeta y promociones por WhatsApp",
    data: "Nombre y WhatsApp",
    basis: "Tu consentimiento, con una casilla propia para ese canal",
    required: "Opcional. Hoy no enviamos mensajes por WhatsApp: si empezamos, te lo vamos a informar antes",
  },
  {
    what: "Poder demostrar qué aceptaste y cuándo",
    data: "Versión del texto aceptado, fecha y hora, origen (reserva web, alta de tarjeta, panel del cliente, link de baja) y el turno o la ficha a la que corresponde",
    basis: "La ley exige que el consentimiento sea expreso y se pueda acreditar (art. 5, Ley 25.326)",
    required: "Se genera solo al aceptar o dar de baja",
  },
];

const PrivacyPolicy = () => (
  <LegalPage title="Política de Privacidad" version={PRIVACY_VERSION}>
    <Section title="1. Quién es responsable de tus datos">
      <p>
        {BUSINESS.name} (CUIT <Strong>{BUSINESS.cuit}</Strong>), con domicilio en {BUSINESS.address}, es responsable
        de los datos personales que se recolectan en <Strong>{BUSINESS.site}</Strong> y en el local.
      </p>
      <p>Contacto para cualquier consulta sobre tus datos: <MailLink />.</p>
    </Section>

    <Section title="2. Qué datos usamos, para qué y por qué">
      <p>Solo pedimos los datos necesarios para cada finalidad:</p>
      <div className="space-y-3">
        {PURPOSES.map(p => (
          <div key={p.what} className="rounded-lg border border-border p-4 text-sm space-y-1">
            <p className="text-foreground font-medium">{p.what}</p>
            <p><span className="text-foreground/80">Datos:</span> {p.data}</p>
            <p><span className="text-foreground/80">Fundamento:</span> {p.basis}</p>
            <p><span className="text-foreground/80">¿Es obligatorio?</span> {p.required}</p>
          </div>
        ))}
      </div>
      <p>
        Reservar un turno no te suscribe a promociones. La tarjeta funciona igual aunque no aceptes recibirlas.
        No vendemos tus datos ni los usamos para publicidad de terceros. No usamos herramientas de analítica ni de
        publicidad en el sitio.
      </p>
    </Section>

    <Section title="3. Quién puede ver tus datos">
      <ul className="list-disc pl-5 space-y-1">
        <li><Strong>Personal de {BUSINESS.name}:</Strong> el dueño y los barberos, con cuentas personales y solo para atenderte y gestionar turnos, cobros y la tarjeta.</li>
        <li><Strong>Soporte técnico:</Strong> el proveedor que desarrolla y mantiene el sitio accede para resolver problemas y verificar que funcione. Actúa por cuenta de {BUSINESS.name}.</li>
        <li><Strong>Supabase Inc.:</Strong> aloja la base de datos y gestiona el inicio de sesión de la tarjeta, incluido el envío del código de acceso por email.</li>
        <li><Strong>Servicio de correo:</Strong> envía los emails de confirmación y cancelación de turnos.</li>
        <li><Strong>Autoridades:</Strong> solo cuando una ley o una orden judicial lo exija.</li>
      </ul>
    </Section>

    <Section title="4. Transferencia internacional">
      <p>
        Los servidores de Supabase donde se guardan los datos están en los <Strong>Estados Unidos</Strong>. La
        autoridad argentina de protección de datos no incluye a ese país entre los que tienen un nivel de protección
        adecuado, por lo que esta transferencia debe hacerse con las garantías que exige la Ley 25.326 y su
        reglamentación. Podés pedirnos información sobre esas garantías escribiendo a <MailLink />.
      </p>
    </Section>

    <Section title="5. Cuánto tiempo guardamos tus datos">
      <ul className="list-disc pl-5 space-y-1">
        <li><Strong>Datos de reservas:</Strong> hasta 2 años desde tu último turno. Después se eliminan o se anonimizan.</li>
        <li><Strong>Registros de cobro:</Strong> el plazo que exijan las normas contables y fiscales.</li>
        <li><Strong>Tarjeta de fidelidad:</Strong> mientras la tengas activa. Si pasan 2 años sin visitas, se da de baja y se eliminan sus datos.</li>
        <li><Strong>Promociones:</Strong> hasta que te des de baja o se elimine la tarjeta.</li>
        <li><Strong>Registro de aceptaciones y bajas:</Strong> mientras uses el servicio y hasta 3 años después, para poder responder reclamos.</li>
      </ul>
      <p>Si pedís que eliminemos tus datos antes, lo hacemos, salvo lo que una ley nos obligue a conservar.</p>
    </Section>

    <Section title="6. Tus derechos">
      <p>Según la <Strong>Ley 25.326 de Protección de Datos Personales</Strong>, podés:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><Strong>Acceder</Strong> a tus datos, gratis, cada 6 meses o antes si tenés un interés legítimo. Respondemos dentro de los 10 días corridos.</li>
        <li><Strong>Rectificar, actualizar o suprimir</Strong> tus datos. Lo hacemos dentro de los 5 días hábiles.</li>
        <li><Strong>Retirar tu consentimiento</Strong> para promociones en cualquier momento, sin afectar la tarjeta ni tus turnos.</li>
        <li><Strong>Pedir que te quiten de nuestras listas de promociones</Strong> (retiro o bloqueo, art. 27 de la Ley 25.326).</li>
      </ul>
      <p>
        Cómo hacerlo: escribí a <MailLink /> desde el email que nos diste o indicando tu teléfono. Para
        promociones también podés usar el link de baja de cada email o las preferencias de{" "}
        <Link to="/mi-tarjeta" className="text-primary hover:underline">tu tarjeta</Link>. Podemos pedirte que
        acredites tu identidad antes de entregarte o modificar datos.
      </p>
      <p className="rounded-lg border border-border p-4 text-sm">
        LA AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326,
        tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus
        derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
      </p>
    </Section>

    <Section title="7. Seguridad">
      <p>
        Los datos viajan cifrados. Cada persona del equipo accede con su propia cuenta y según su rol. Los registros
        de aceptación no se pueden modificar una vez guardados.
      </p>
    </Section>

    <Section title="8. Cookies y almacenamiento en tu navegador">
      <p>
        El sitio solo guarda en tu navegador lo necesario para funcionar. No usa cookies de analítica ni de
        publicidad. El detalle está en la <Link to="/cookies" className="text-primary hover:underline">política de cookies</Link>.
      </p>
    </Section>

    <Section title="9. Cambios en esta política">
      <p>
        Si cambia esta política, publicamos la nueva versión con su fecha. Si el cambio afecta algo que autorizaste,
        te vamos a pedir el consentimiento de nuevo antes de aplicarlo.
      </p>
    </Section>
  </LegalPage>
);

export default PrivacyPolicy;
