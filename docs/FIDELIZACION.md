# Programa de fidelidad — MVP Barber

Tarjeta digital de visitas integrada a la web, base unificada de clientes y registro de consentimiento para email marketing.

## Rutas nuevas

| Ruta | Quién | Qué |
|---|---|---|
| `/mi-tarjeta` | Clientes | Alta sin contraseña (código o enlace por email), tarjeta y premios. Desde el 29/10/2026 no muestra "Tus servicios" ni "Preferencias" (pedido del dueño): la baja de promociones queda por el link de cada email |
| `/baja?token=…` | Cualquiera | Baja de promociones desde un email, sin iniciar sesión (pide confirmar) |
| `/admin/clientes` | Admin y barberos | Búsqueda, ficha, canjes, atención sin turno. Solo admin: correcciones, reglas, unir fichas, exportar CSV |

En la portada, a quien no tiene sesión se le abre a los 3 s un anuncio que presenta la tarjeta: muestra las condiciones vigentes del programa y trae el formulario de alta. Se puede cerrar y no vuelve a abrirse solo en ese navegador. Tampoco se abre si la persona está reservando. El botón **"Mi tarjeta de fidelidad"** de la portada (reemplaza a "Ver servicios") abre ese anuncio a quien no tiene sesión y lleva a `/mi-tarjeta` a quien sí tiene. Entre "Servicios" y "Nuestros barberos" hay una sección (`#fidelidad`) que presenta la tarjeta en 3 pasos con las condiciones vigentes y un botón para crearla.

## Reglas del programa

- **Fecha de inicio: martes 3/11/2026.** Turnos atendidos y atenciones sin turno con fecha anterior no suman (quedan como "anterior a la tarjeta"); la visita manual con fecha anterior se rechaza (`before_loyalty_start`). La fecha vive en `loyalty_settings.starts_on` (migración `20261029130000_loyalty_start_date.sql`) y en `LOYALTY_START_DATE` (`src/lib/loyalty.ts`), que muestra el aviso en la tarjeta hasta ese día. En la base de pruebas, `seed.sql` y `loyalty.test.sql` la adelantan para sus datos con fechas pasadas.
- **Una reserva no suma.** Suma una visita cuando el personal marca el turno como `atendido` (desde cualquier pantalla: el trigger `appointments_loyalty` lo hace en la base) o registra una **atención sin turno** con cliente.
- **Una sola vez por atención.** Índices únicos parciales por turno y por cobro. Doble clic, reintentos y operaciones simultáneas no duplican (probado con 8 pedidos en paralelo).
- **Cancelados y ausentes no suman.** Solo cuenta `atendido`.
- **Ciclos:** al llegar a N visitas se genera un premio y el ciclo descuenta N. Los premios se acumulan.
- **La atención en la que se canjea un premio también suma.**
- **Cambio de reglas:** crea una versión nueva del programa. El progreso de cada cliente se mantiene y la nueva N aplica desde su próxima visita. Los premios ya ganados conservan su beneficio y su N.
- **Reversión** (solo admin, con motivo): si el ciclo tiene visitas, descuenta una. Si está en 0 porque se acaba de ganar un premio: premio sin canjear → se anula y el ciclo vuelve a N−1; premio ya canjeado → se mantiene y el ciclo queda en −1 (el cliente "debe" una visita).
- **Desmarcar `atendido`** en un turno revierte su visita automáticamente (queda registrado quién lo hizo).
- **Canjes:** solo personal, con confirmación; no se pueden repetir.
- **Historial:** toda acreditación, reversión, canje, cambio de reglas, unión de fichas y vínculo de reservas queda en `loyalty_events` con usuario, fecha y motivo.
- **Configuración inicial DEMO:** 10 visitas = "DEMO — beneficio a definir por MVP Barber". Se cambia desde Clientes → Programa.

## Modelo de datos

| Concepto | Tabla |
|---|---|
| Perfil del cliente | `clients` (extendida: `user_id`, `birth_day`, `birth_month`, `source`, `unsubscribe_token`; email normalizado) |
| Identidad autenticada | `auth.users` ↔ `clients.user_id` (única). El email de la tarjeta sale de la sesión verificada |
| Reservas y atenciones | `appointments`, `payments` (sin cambios de estructura) |
| Programa | `loyalty_programs` (versionado, un solo activo) |
| Movimientos | `loyalty_accounts` (saldo), `loyalty_visits`, `loyalty_rewards`, `loyalty_events` (auditoría) |
| Consentimiento | `marketing_consent_texts` (versión + texto), `marketing_consents` (historial de altas y bajas, nunca se edita), `data_export_log` |

Seguridad: RLS en todas las tablas nuevas. Los clientes leen solo sus filas; no tienen permisos de escritura en ninguna tabla de fidelidad. Toda escritura pasa por funciones `SECURITY DEFINER` que validan el rol (`redeem_reward`, `staff_register_walk_in`, `admin_*`, `loyalty_register`, etc.). La exportación es solo admin, incluye únicamente consentimiento vigente con email verificado y protege el CSV contra fórmulas.

## Duplicados y reservas anteriores

Nunca se unen solos. En la ficha (admin) aparecen **posibles duplicados** (mismo teléfono, email o nombre y apellido) y **reservas sin ficha** con el mismo teléfono. El admin confirma en persona que es el mismo cliente y elige "Unir aquí" o "Vincular", escribiendo el motivo.

- Unir mueve reservas, visitas, premios y consentimientos, suma el progreso y borra la ficha duplicada. No une dos tarjetas verificadas distintas.
- Vincular una reserva vieja **no suma visitas**. Si hay evidencia de que se atendió, el admin suma una visita manual con motivo.
- Los turnos `atendido` anteriores al lanzamiento aparecen en el historial como "anterior a la tarjeta" y no suman.

## Desarrollo local

La app de desarrollo usa **solo** el proyecto Supabase de pruebas `mvp-barber-dev` (`oxapiokwxziphfpktnah`). El `.env` del repo apunta a producción: no usarlo para probar.

1. `.env.development.local` (git lo ignora; pisa a `.env` en `npm run dev`):
   ```
   VITE_SUPABASE_PROJECT_ID=oxapiokwxziphfpktnah
   VITE_SUPABASE_URL=https://oxapiokwxziphfpktnah.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<clave publishable del proyecto de pruebas>
   ```
   Nunca poner claves `service_role` en variables `VITE_*`.
2. Vincular la CLI: `supabase link --project-ref oxapiokwxziphfpktnah`.
3. Comandos (todos se niegan a correr si la CLI está vinculada a otro proyecto):

| Comando | Qué hace |
|---|---|
| `npm run db:push:dev` | Aplica migraciones a la base de pruebas |
| `npm run db:reset:dev` | Borra los datos y recarga los datos demo |
| `npm run db:test:dev` | 62 pruebas SQL de permisos, reglas y exportación (dentro de una transacción con ROLLBACK) |
| `npm run test:concurrency:dev` | Pedidos simultáneos reales; después correr `db:reset:dev` |
| `npm run db:types:dev` | Regenera `src/integrations/supabase/types.ts` |
| `npm test` | Tests unitarios (Vitest) |

Usuarios demo (contraseña `MvpDemo2026!`, emails inexistentes `@mvp.test`):

| Usuario | Rol | Estado |
|---|---|---|
| admin@mvp.test | Admin | — |
| barbero@mvp.test | Barbero (Juan) | Turnos de hoy: Sofía 18:00, Martín 19:00, Lucas 20:00 |
| sofia@mvp.test | Cliente | 7/10, suscripta a promociones |
| martin@mvp.test | Cliente | 10 visitas, 1 premio disponible, no suscripto |

Los clientes demo no tienen acceso con contraseña desde la web (solo código por email). Para probar el panel del cliente, usar tu propio email en `/mi-tarjeta`.

### Configuración de Auth del proyecto de pruebas (dashboard)

- Authentication → URL Configuration: **Site URL** `http://localhost:8080` y en Redirect URLs `http://localhost:8080/**`.
- Authentication → Emails → plantillas **Magic Link** y **Confirm signup**: agregar el código `{{ .Token }}` además del enlace.
- El SMTP integrado de Supabase tiene un límite bajo de envíos por hora. Para pruebas largas, o en producción, configurar un SMTP propio.

## Antes de pasar a producción (requiere autorización)

1. Comparar el esquema real de producción con las migraciones del repo (`supabase db diff` contra producción, solo lectura). Hay diferencias conocidas: `has_any_admin()` existe solo en producción, `access_requests` difiere y la migración `20260501000000_client_portal.sql` no se puede aplicar sobre una base vacía.
2. Backup de la base de producción.
3. Aplicar `20261022120000_loyalty_program.sql` en una ventana de poco movimiento.
4. Configurar Auth de producción: Site URL `https://barberiampv.com`, plantillas con `{{ .Token }}` y SMTP propio (ya existe SMTP para los emails de turnos).
5. Publicar los documentos legales actualizados (ver `docs/LEGAL.md`) **antes** de habilitar la invitación.
6. Definir las reglas reales del programa desde Clientes → Programa.

## Política de privacidad y documentos legales

Actualizados el 22/10/2026 (Términos, Privacidad, Cookies y registro de aceptación). Ver `docs/LEGAL.md`, que incluye pendientes y puntos a revisar con un abogado.

## Problemas previos detectados (fuera de este alcance)

- ~~`get_client_by_phone` devuelve nombre, email y nacimiento a cualquiera que sepa un teléfono.~~ Resuelto en `20261022150000_legal_compliance.sql`: devuelve solo el id.
- `/mi-turno` (`get_my_appointments`, `cancel_my_appointment`) usa el teléfono como prueba de identidad.
- La Edge Function `send-confirmation-email` permite enviar emails a cualquier dirección con contenido arbitrario.
- `CollectPaymentDialog` marca `atendido` y crea el cobro en dos pasos separados: si el segundo falla, queda la visita sin cobro.
- En `/panel` hay un elemento que ensancha la página en celulares (411 px en una pantalla de 390).

## Página de cada barbero ("Sus mejores cortes")

- En la portada, cada barbero de "Nuestros barberos" lleva a `/barberos/<slug>` (el slug se genera solo a partir del nombre, ej. `juan-demo`).
- La página muestra foto/inicial, presentación, galería de cortes (tocando una foto se ve grande, con flechas) y botones **"Reservar con <nombre>"**: la reserva se abre con ese barbero ya elegido (pasa de elegir servicio directo a fecha y hora).
- **Las fotos las sube cada barbero desde su cuenta**: Panel → "Mis cortes" → "Agregar fotos". Se achican a 1600 px en el navegador antes de subir. Puede agregar una descripción y borrar fotos. Ahí mismo sube o quita su **foto de perfil** (se recorta en cuadrado; se ve en la portada y en su página) mediante `set_barber_photo`, que solo acepta imágenes de la carpeta de ese barbero. **Máximo 6 fotos de cortes por barbero** (la base lo impide con el trigger `barber_portfolio_limit`; la foto de perfil no cuenta).
- **El admin también puede gestionarlas**: Admin → Barberos → "Fotos (perfil y 6 cortes)" en la tarjeta de cada barbero. Sube, describe y borra fotos y cambia la foto de perfil de cualquier barbero. Otros barberos no pueden tocar fotos ajenas; verlas es público. Migración `20261029120000_portfolio_admin_limit.sql`.
- Datos: tabla `barber_portfolio` + bucket público `barber-portfolio` (carpeta por barbero), migración `20261022130000_barber_portfolio.sql`.
- En la base de pruebas, `npm run db:photos:dev` carga 6 **fotos de ejemplo** (no son cortes reales) para Juan y verifica los permisos; `db:reset:dev` ya lo incluye.

## WhatsApp y consentimiento por canal

- Al crear la tarjeta se piden **nombre y email (verificado)**. WhatsApp y cumpleaños son opcionales; el WhatsApp es obligatorio solo si se acepta recibir mensajes por ese canal (cambio del 22/10/2026, ver `docs/LEGAL.md`). El WhatsApp se guarda normalizado en `clients.whatsapp` (no es único: si coincide con el teléfono de una reserva vieja de otra ficha, aparece como posible duplicado y no se une solo).
- Hay **dos casillas separadas y desmarcadas**: promociones por email y "Quiero recibir por WhatsApp avisos de mi tarjeta y promociones". Cada una tiene su texto versionado (`v1-2026-10`, `wa-v1-2026-10`) y su historial en `marketing_consents.channel`. El cliente las prende o apaga desde su tarjeta; el admin puede registrar la baja de cada canal.
- Base para un futuro agente de WhatsApp: enviar solo a quienes tengan el consentimiento de WhatsApp vigente (`client_channel_opt_in(id, 'whatsapp')`). Además hará falta la API oficial de WhatsApp Business y plantillas aprobadas.
- El CSV de "Exportar suscriptos" (consentimiento de email) incluye WhatsApp (solo dígitos) y si aceptó ese canal.
- Migración: `20261022140000_loyalty_whatsapp.sql`. `marketing_consents.seq` ordena los registros de forma exacta (varios en la misma transacción comparten fecha).

