import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";

const PrivacyPolicy = () => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1 container px-4 py-16 max-w-3xl mx-auto">
      <h1 className="font-serif text-4xl mb-2">Política de Privacidad</h1>
      <p className="text-muted-foreground text-sm mb-10">Última actualización: mayo 2025</p>

      <div className="space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">1. Responsable del tratamiento</h2>
          <p>
            MVP Barber, con domicilio en Av. Francisco Seguí 1157, Rada Tilly, Chubut, Argentina
            (CUIT: <strong className="text-foreground">20-46981513-8</strong>), es el responsable del tratamiento
            de los datos personales recolectados a través de este sitio web (<strong className="text-foreground">barberiampv.com</strong>).
          </p>
          <p className="mt-2">Contacto: <a href="mailto:contacto@barberiampv.com" className="text-primary hover:underline">contacto@barberiampv.com</a></p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">2. Datos que recolectamos</h2>
          <p>Al reservar un turno, recolectamos los siguientes datos:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Nombre y apellido</li>
            <li>Número de teléfono</li>
            <li>Fecha de nacimiento (opcional, para reconocerte como cliente frecuente)</li>
            <li>Historial de turnos (servicio, barbero, fecha, hora)</li>
          </ul>
          <p className="mt-3">
            No recolectamos datos de pago, ya que los turnos no requieren pago online.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">3. Finalidad del tratamiento</h2>
          <p>Tus datos se utilizan exclusivamente para:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Gestionar y confirmar reservas de turnos</li>
            <li>Identificarte como cliente frecuente en futuras visitas</li>
            <li>Enviarte notificaciones sobre tu turno (si corresponde)</li>
            <li>Mejorar la calidad del servicio</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">4. Almacenamiento y seguridad</h2>
          <p>
            Los datos se almacenan en servidores seguros provistos por Supabase (infraestructura en la nube
            con cifrado en tránsito y en reposo). No vendemos ni compartimos tus datos con terceros,
            salvo obligación legal.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">5. Tus derechos</h2>
          <p>
            De acuerdo con la <strong className="text-foreground">Ley 25.326 de Protección de Datos Personales</strong> (Argentina),
            tenés derecho a:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong className="text-foreground">Acceder</strong> a los datos que tenemos sobre vos</li>
            <li><strong className="text-foreground">Rectificar</strong> datos incorrectos o desactualizados</li>
            <li><strong className="text-foreground">Eliminar</strong> tus datos de nuestra base</li>
            <li><strong className="text-foreground">Oponerte</strong> al tratamiento de tus datos</li>
          </ul>
          <p className="mt-3">
            Para ejercer cualquiera de estos derechos, escribinos a{" "}
            <a href="mailto:contacto@barberiampv.com" className="text-primary hover:underline">contacto@barberiampv.com</a>.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">6. Cookies y rastreo</h2>
          <p>
            Este sitio puede utilizar cookies técnicas necesarias para el funcionamiento del sistema de
            reservas. No utilizamos cookies de publicidad ni rastreo de comportamiento de terceros.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl text-foreground mb-3">7. Modificaciones</h2>
          <p>
            Podemos actualizar esta política en cualquier momento. La versión vigente siempre estará
            disponible en esta página con la fecha de última actualización.
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

export default PrivacyPolicy;
