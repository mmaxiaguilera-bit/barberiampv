-- =====================================================================
-- SEGURIDAD, PARTE 2 (cierre). Aplicar DESPUÉS de publicar el frontend que usa
-- create_booking / get_appointments_by_tokens / get_full_day_blocked_dates.
-- Requiere 20261105120000_security_hardening.sql.
-- =====================================================================

-- A3/A2: la API pública ya no inserta directo; solo el personal (carga manual de turnos)
DROP POLICY IF EXISTS "Anyone create valid appointment" ON public.appointments;
DROP POLICY IF EXISTS "Anyone create appointment" ON public.appointments;
DROP POLICY IF EXISTS "Staff create appointments" ON public.appointments;
CREATE POLICY "Staff create appointments" ON public.appointments FOR INSERT
WITH CHECK (
  public.is_staff(auth.uid())
  AND length(trim(client_name)) BETWEEN 2 AND 100
  AND length(trim(client_phone)) BETWEEN 6 AND 25
  AND length(trim(service_name)) BETWEEN 1 AND 100
);
REVOKE INSERT ON public.appointments FROM anon;

DROP POLICY IF EXISTS "Anyone create client" ON public.clients;
REVOKE INSERT ON public.clients FROM anon;

-- A1: sin acceso por teléfono
DROP FUNCTION IF EXISTS public.get_my_appointments(TEXT);
DROP FUNCTION IF EXISTS public.cancel_my_appointment(TEXT, UUID);

-- B4: sin búsqueda pública por teléfono
DROP FUNCTION IF EXISTS public.get_client_by_phone(TEXT);

-- B5: anon ya no lee barber_blocks (veía el motivo); usa get_full_day_blocked_dates / get_blocked_ranges
DROP POLICY IF EXISTS "Anyone view blocks" ON public.barber_blocks;

-- B3: sin auto-alta de admin
DROP FUNCTION IF EXISTS public.claim_first_admin();
