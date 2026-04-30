# Plan: Bloqueos por barbero + limpieza UI

## 1. Bloqueos por barbero (días feriados, vacaciones, turnos por WhatsApp)

### Base de datos
Nueva tabla `barber_blocks` con `barber_id` obligatorio (todos los bloqueos pertenecen a un barbero específico):

- `id` uuid PK
- `barber_id` uuid (NOT NULL) — quién está bloqueado
- `block_date` date (NOT NULL) — día del bloqueo
- `start_time` time (nullable) — si es null = día completo
- `end_time` time (nullable) — si es null = día completo
- `reason` text (nullable) — ej: "Feriado", "Vacaciones", "WhatsApp - Juan"
- `created_by` uuid, `created_at` timestamptz

**RLS:**
- Cualquiera puede SELECT (necesario para que el booking público filtre)
- Admin: ALL
- Barbero: ALL solo sobre filas donde `barber_id` coincide con su propio barbero (vía `barbers.user_id = auth.uid()`)

**RPC** `get_blocked_ranges(_barber_id, _date)` que devuelve start/end (con día completo expandido al horario del schedule).

### Lógica de booking
Actualizar `src/lib/booking.ts` → `getAvailableSlots`: además de `get_taken_slots`, consultar bloqueos del barbero/fecha y descartar slots que caigan dentro de algún rango bloqueado (o todos si es día completo).

### UI Admin (`AdminSchedules.tsx`)
Agregar pestaña "Bloqueos" junto a la grilla semanal. Para el barbero seleccionado en el selector de arriba:
- Lista de bloqueos futuros (fecha, rango o "día completo", motivo, eliminar)
- Botón "Nuevo bloqueo" → diálogo con: fecha, toggle "día completo", desde/hasta, motivo

### UI Barbero (`BarberPanel.tsx`)
Nueva sección "Mis bloqueos" + botón rápido "Bloquear horario" en cada slot del día. Al hacer clic en un horario libre se abre un mini-diálogo: motivo (default "Reservado por WhatsApp") y crea el bloqueo automáticamente con su `barber_id`. Ya no aparece disponible en la web pública.

## 2. Limpieza UI (header / footer)

- `src/components/SiteHeader.tsx`: eliminar el botón "Acceso staff" cuando no hay usuario logueado.
- `src/pages/Index.tsx`: agregar en el footer un link discreto "Staff" → `/auth` (texto pequeño, color muted).

## Detalles técnicos

```text
Flujo bloqueo WhatsApp:
1. Cliente escribe a Juan por WhatsApp pidiendo martes 15:30
2. Juan abre /panel → día martes → clic en slot 15:30 → "Bloquear"
3. Se inserta barber_blocks(barber_id=juan, date=mar, 15:30-16:15, reason="WhatsApp - Cliente")
4. Web pública: getAvailableSlots(juan, mar) ya excluye 15:30
5. Pedro sigue mostrando 15:30 disponible (bloqueo es solo de Juan)
```

## Archivos afectados

- Migración SQL: tabla `barber_blocks` + RLS + RPC
- `src/lib/booking.ts` (filtro de bloqueos)
- `src/pages/AdminSchedules.tsx` (pestaña Bloqueos)
- `src/pages/BarberPanel.tsx` (botón rápido + lista)
- `src/components/BlockSlotDialog.tsx` (nuevo)
- `src/components/SiteHeader.tsx` (quitar botón)
- `src/pages/Index.tsx` (link en footer)
