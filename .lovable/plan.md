# Cierre de caja y administración completa

Tu cliente pidió dos cosas: **cierre de caja** (control diario del dinero) y **administrar todo** (gestionar lo que hoy todavía no se puede tocar desde la UI: servicios, horarios y métodos de pago). Este es el plan.

## Qué falta hoy
Revisé el panel y encontré huecos importantes:
- **Servicios**: existen en la base pero no hay pantalla para crearlos/editarlos (solo se ven en la web).
- **Horarios**: la tabla `schedules` existe, pero no hay UI para configurarlos por barbero.
- **Caja**: no hay forma de registrar pagos, ver totales del día, ni hacer cierre.
- **Gastos**: no se pueden cargar egresos.
- **Reportes**: el resumen actual cuenta turnos pero no muestra plata.

## Lo que voy a construir

### 1. Cierre de caja diario (lo más importante)
Pantalla nueva **`/admin/caja`** con:
- Selector de fecha (por defecto hoy) + filtro por barbero.
- **Resumen del día**: total facturado, cantidad de servicios atendidos, ticket promedio, desglose por método de pago (efectivo, transferencia, tarjeta, MercadoPago).
- **Lista de cobros del día**: cada turno atendido con cliente, servicio, barbero, monto, método de pago, propina, hora.
- Botón **"Registrar cobro"** para cargar un servicio sin turno previo (walk-in).
- Sección **"Gastos del día"**: cargar egresos (insumos, sueldos, servicios) con descripción y monto.
- **Cierre del día**: muestra `Ingresos - Egresos = Total en caja`, con botón **"Cerrar caja"** que congela el día (ya no se puede modificar) y guarda quién cerró y a qué hora.
- Botón **"Imprimir / PDF"** del resumen para guardar comprobante.

### 2. Cobro al marcar turno como "atendido"
Cuando un barbero o admin marca un turno como **atendido** desde el `AppointmentSheet`, se abre un mini-formulario:
- Monto cobrado (precargado con el precio del servicio, editable por descuento o adicional).
- Método de pago (efectivo / transferencia / tarjeta / mercadopago / otro).
- Propina (opcional).
- Notas.

Eso queda registrado en la tabla de pagos y aparece automáticamente en la caja del día.

### 3. Gestión de Servicios (`/admin/servicios`)
Pantalla nueva para crear / editar / activar / ordenar servicios (nombre, descripción, precio, duración, orden de visualización). Hoy solo se pueden tocar desde la base de datos.

### 4. Gestión de Horarios (`/admin/horarios`)
Pantalla nueva: por cada barbero, definir días de la semana y franjas horarias (inicio, fin, duración del turno). Permite tener horarios distintos por barbero (ej. uno trabaja sábados, otro no).

### 5. Reporte mensual (`/admin/reportes`)
- Filtro por mes y barbero.
- Total facturado, total de gastos, ganancia neta.
- Ranking de servicios más vendidos.
- Ranking de barberos por facturación.
- Gráfico simple de ingresos por día del mes.
- Exportar a CSV.

### 6. Mejoras al resumen actual (`/admin`)
Agregar: **facturación de hoy**, **facturación de la semana**, **caja abierta/cerrada hoy**, además de las métricas que ya están.

## Cambios técnicos (resumen)

**Nuevas tablas en la base de datos:**
- `payments` — un cobro por turno atendido (o walk-in): `id, appointment_id (nullable), barber_id, amount, tip, payment_method, paid_at, notes, created_by`.
- `expenses` — gastos del día: `id, date, amount, description, category, created_by`.
- `cash_closures` — cierre de caja: `id, date, total_income, total_expenses, total_cash, closed_by, closed_at, notes`. Una fila por día.

Todas con RLS: solo admins pueden ver/editar `expenses` y `cash_closures`; barberos pueden ver sus propios `payments`.

**Nuevas páginas:**
- `src/pages/AdminCash.tsx` (cierre de caja)
- `src/pages/AdminServices.tsx` (servicios)
- `src/pages/AdminSchedules.tsx` (horarios)
- `src/pages/AdminReports.tsx` (reportes mensuales)

**Cambios en componentes existentes:**
- `AppointmentSheet.tsx`: al marcar atendido, pedir método de pago y monto, e insertar en `payments`.
- `PanelLayout.tsx`: agregar entradas de menú (Caja, Servicios, Horarios, Reportes).
- `App.tsx`: registrar las 4 rutas nuevas.
- `AdminOverview.tsx`: agregar tarjetas de facturación.

**Lógica clave:**
- Una vez que un día está cerrado (`cash_closures` tiene una fila para esa fecha), bloquear edición de `payments` y `expenses` de ese día (vía RLS o validación en UI).
- El `payment_method` se maneja como enum Postgres: `efectivo`, `transferencia`, `tarjeta`, `mercadopago`, `otro`.

## Lo que NO incluye este plan
- Integración real con MercadoPago / pasarelas de pago online (solo se registra el método como etiqueta).
- Facturación electrónica AFIP.
- Gestión de stock de productos (gel, shampoo, etc.).

Si querés alguno de esos, decímelo y lo agregamos en otra iteración.

¿Te parece bien así o querés ajustar algo (por ejemplo, sumar stock de productos, o sacar el cierre con bloqueo del día)?