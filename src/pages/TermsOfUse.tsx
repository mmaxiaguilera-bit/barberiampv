import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";

const TermsOfUse = () => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1 container px-4 py-16 max-w-3xl mx-auto">
      <h1 className="font-serif text-4xl mb-2">Términos y Condiciones</h1>
      <p className="text-muted-foreground text-sm mb-10">Última actualización: mayo 2025</p>

      <div className="space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">1. Aceptación de los términos</h2>
          <p>
            Al utilizar el sistema de reservas de <strong className="text-foreground">MVP Barber</strong> en{" "}
            <strong className="text-foreground">barberiampv.com</strong>, aceptás estos Términos y Condiciones
            en su totalidad. Si no estás de acuerdo, te pedimos que no utilices el servicio de reservas online.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">2. Descripción del servicio</h2>
          <p>
            MVP Barber ofrece un sistema de reserva de turnos online para servicios de peluquería y barbería
            en Rada Tilly, Chubut, Argentina. El servicio permite al usuario seleccionar un barbero, servicio,
            fecha y horario disponible, y confirmar su turno de forma gratuita.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">3. Reservas</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>La reserva queda confirmada una vez completado el formulario.</li>
            <li>Cada turno es personal e intransferible.</li>
            <li>Los horarios están sujetos a disponibilidad real al momento de la reserva.</li>
            <li>El usuario es responsable de brindar datos correctos (nombre, teléfono).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">4. Cancelaciones y reprogramaciones</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Podés cancelar o reprogramar tu turno comunicándote con el local antes del horario reservado.</li>
            <li>Se solicita un aviso mínimo de <strong className="text-foreground">2 horas</strong> antes del turno.</li>
            <li>MVP Barber se reserva el derecho de cancelar turnos ante circunstancias imprevistas,
              notificando al cliente con la mayor anticipación posible.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">5. Ausencias (no-show)</h2>
          <p>
            La ausencia reiterada sin cancelación previa puede resultar en la suspensión del acceso al
            sistema de reservas online.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">6. Pagos</h2>
          <p>
            El sistema de reservas online no procesa pagos. El cobro de los servicios se realiza
            exclusivamente de forma presencial en el local, en el momento del servicio.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">7. Responsabilidad</h2>
          <p>
            MVP Barber no se responsabiliza por inconvenientes técnicos ajenos a su control (caída de
            internet, fallas del dispositivo del usuario, etc.) que impidan completar una reserva.
            Ante cualquier problema, podés contactarnos directamente.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">8. Propiedad intelectual</h2>
          <p>
            El contenido de este sitio web (logo, textos, diseño) es propiedad de MVP Barber. Queda
            prohibida su reproducción sin autorización expresa.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">9. Ley aplicable</h2>
          <p>
            Estos términos se rigen por la legislación argentina, en particular por la{" "}
            <strong className="text-foreground">Ley 24.240 de Defensa del Consumidor</strong> y sus
            modificatorias. Cualquier controversia se someterá a la jurisdicción de los tribunales
            ordinarios de la Provincia de Chubut.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">10. Contacto</h2>
          <p>
            MVP Barber · CUIT: <strong className="text-foreground">20-46981513-8</strong> · Av. Francisco Seguí 1157, Rada Tilly, Chubut.
          </p>
          <p className="mt-2">
            Para consultas sobre estos términos, escribinos a{" "}
            <a href="mailto:contacto@barberiampv.com" className="text-primary hover:underline">contacto@barberiampv.com</a>.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t border-border">
        <Link to="/" className="text-primary hover:underline text-sm">← Volver al inicio</Link>
      </div>
    </main>

    <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
      <div className="container px-4">
        <span>© {new Date().getFullYear()} MVP Barber · Rada Tilly, Chubut</span>
      </div>
    </footer>
  </div>
);

export default TermsOfUse;
