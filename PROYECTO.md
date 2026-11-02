# MVP Barber — Información del Proyecto

## Datos del negocio

| Campo | Valor |
|---|---|
| Nombre | MVP Barber — Premium Barber Studio |
| Ubicación | Rada Tilly, Chubut, Argentina |
| Horarios | Lunes a Sábado, 10:00 — 21:00 |
| Instagram | [@mvpbarber_](https://instagram.com/mvpbarber_) |
| Web | [barberiampv.com](https://barberiampv.com) |
| Email | contacto@barberiampv.com *(confirmar si es real)* |
| CUIT | *(pendiente — agregar en footer y páginas legales)* |

---

## Repositorio y deploy

| Campo | Valor |
|---|---|
| GitHub | https://github.com/mmaxiaguilera-bit/barberiampv |
| Rama principal | `main` |
| Hosting | Easypanel (auto-deploy desde GitHub) |
| IP del servidor | 76.13.168.215 |
| URL interna Easypanel | barberiampv-web.gda0sj.easypanel.host |
| DNS | Hostinger — A record `@` y `www` → 76.13.168.215 |

Para redesplegar: entrar a Easypanel → hacer click en **Implementar**

---

## Stack técnico

- **Frontend:** React + TypeScript + Vite
- **UI:** shadcn/ui + Tailwind CSS (tema dark luxury dorado)
- **Backend/DB:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Router:** React Router v6
- **Hosting:** Easypanel (Docker/Nginx)
- **Email transaccional:** Edge Function `send-cancellation-email` vía SMTP

---

## Rutas de la aplicación

| Ruta | Descripción |
|---|---|
| `/` | Landing pública |
| `/auth` | Login staff |
| `/panel` | Panel del barbero |
| `/admin` | Overview admin |
| `/admin/turnos` | Gestión de turnos (vista día/semana) |
| `/admin/barberos` | Barberos |
| `/admin/servicios` | Servicios |
| `/admin/horarios` | Horarios |
| `/admin/caja` | Caja |
| `/admin/reportes` | Reportes |
| `/admin/usuarios` | Usuarios |
| `/admin/clientes` | Clientes |
| `/mi-turno` | Consulta de turno por teléfono |
| `/mi-tarjeta` | Tarjeta de fidelidad del cliente (acceso por código al email) |
| `/baja` | Baja de promociones desde link de email |
| `/barberos/:slug` | Página pública de cada barbero con sus mejores cortes y reserva directa |
| `/privacidad` | Política de Privacidad (Ley 25.326) |
| `/terminos` | Términos y Condiciones (Ley 24.240) |

---

## Base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `appointments` | Turnos (nombre, teléfono, servicio, barbero, fecha, hora, estado) |
| `barbers` | Barberos (nombre, bio, activo, orden) |
| `services` | Servicios (nombre, precio, duración, activo) |
| `schedules` | Horarios disponibles por barbero y día |
| `clients` | Clientes registrados (email, nombre, cumpleaños, cuenta verificada) |
| `loyalty_*` | Programa de fidelidad: programa, saldos, visitas, premios, auditoría |
| `marketing_consents` | Historial de consentimiento para promociones por email |

---

## Programa de fidelidad

Ver [`docs/FIDELIZACION.md`](docs/FIDELIZACION.md): reglas, modelo de datos, entorno de pruebas y pasos antes de producción.

---

## Páginas legales

- `/privacidad` — Política de Privacidad (Ley 25.326 de Protección de Datos)
- `/terminos` — Términos y Condiciones (Ley 24.240 de Defensa del Consumidor)
- Links visibles en el footer del sitio

---

## Pendientes

- [x] Confirmar email de contacto real — contacto@barberiampv.com activo (Hostinger)
- [x] Agregar CUIT del titular (20-46981513-8) en footer y páginas legales
- [x] Mensaje "cliente frecuente" y campo fecha de nacimiento en BookingDialog — implementado
