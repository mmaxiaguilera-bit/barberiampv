-- =====================================================================
-- SEGURIDAD (auditoría 2026-11-05, ver REPORTE_SEGURIDAD.md, local, no versionado)
-- =====================================================================
-- A3/A2  La reserva web pasa por create_booking(): el servidor pone precio,
--        duración y nombre del servicio, valida horario, bloqueos, solapamiento
--        y límites. anon ya no inserta directo en appointments ni en clients.
-- A1     Ver y cancelar un turno exige el cancel_token del turno (link del mail
--        o guardado en el dispositivo), no alcanza con el teléfono. El email pasa a
--        ser obligatorio en la reserva web y se puede pedir el reenvío de los links
--        (edge function send-booking-links, con límite en booking_link_requests).
-- M1     El barbero no puede cambiar cliente, precio, servicio, duración,
--        barbero ni teléfono de sus turnos (solo estado y notas).
-- M2     Los barberos (no admin) dejan de ver gastos y cierres de caja.
-- B3     Se elimina claim_first_admin y no se puede quitar el último admin.
-- B4     Se elimina get_client_by_phone (anon podía saber si un teléfono es cliente).
-- B5     anon ya no lee barber_blocks (veía el motivo); usa RPC sin motivo.
-- B6     has_role / is_staff solo responden por el usuario que consulta.
-- B7     Un usuario solo puede editar su full_name en profiles (no el email).
-- PARTE 1 (aditiva): convive con el frontend anterior. Aplicar ANTES de publicar
-- el frontend nuevo. La parte 2 (20261105130000_security_lockdown.sql) cierra lo
-- viejo y se aplica DESPUÉS de que Vercel publicó el frontend nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en appointments
-- ---------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancel_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_sent_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_cancel_token_key ON public.appointments (cancel_token);

-- ---------------------------------------------------------------------
-- 2. B6: helpers de rol que solo responden por quien consulta
--    (todas las políticas y funciones los llaman con auth.uid())
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(_user_id = auth.uid(), false) AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(_user_id = auth.uid(), false) AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'barber')
  )
$$;

-- ---------------------------------------------------------------------
-- 3. A3 + A2: reserva web validada en el servidor
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking(
  _service_id UUID, _barber_id UUID, _date DATE, _time TIME,
  _first_name TEXT, _last_name TEXT, _phone TEXT, _email TEXT DEFAULT NULL,
  _terms_version TEXT DEFAULT NULL, _privacy_notice_version TEXT DEFAULT NULL
) RETURNS TABLE (booking_id UUID, booking_token UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMP := now() AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_first TEXT := trim(coalesce(_first_name, ''));
  v_last TEXT := trim(coalesce(_last_name, ''));
  v_phone TEXT := trim(coalesce(_phone, ''));
  v_email TEXT := NULLIF(lower(trim(coalesce(_email, ''))), '');
  v_svc public.services;
  v_client public.clients;
  v_client_id UUID;
  v_start INT;
  v_end INT;
  v_id UUID;
  v_token UUID;
BEGIN
  -- Datos de la persona
  IF length(v_first) NOT BETWEEN 2 AND 50 OR length(v_last) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF length(v_phone) NOT BETWEEN 6 AND 25 OR v_phone !~ '^[0-9 +()-]+$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  -- El email es obligatorio: por ahí llega el link personal para ver y cancelar el turno
  IF v_email IS NULL OR length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_document_versions WHERE version = _terms_version AND document = 'terms')
     OR NOT EXISTS (SELECT 1 FROM public.legal_document_versions WHERE version = _privacy_notice_version AND document = 'privacy') THEN
    RAISE EXCEPTION 'terms_not_accepted' USING ERRCODE = '22023';
  END IF;

  -- Servicio y barbero: precio, nombre y duración salen de la base
  SELECT * INTO v_svc FROM public.services WHERE id = _service_id AND active;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'invalid_service' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.barbers WHERE id = _barber_id AND active) THEN
    RAISE EXCEPTION 'invalid_barber' USING ERRCODE = '22023';
  END IF;

  -- Fecha y hora: futuro, hasta 6 meses
  IF _date IS NULL OR _time IS NULL OR _date > v_now::date + 186 OR (_date + _time) <= v_now THEN
    RAISE EXCEPTION 'invalid_datetime' USING ERRCODE = '22023';
  END IF;
  v_start := (extract(epoch FROM _time) / 60)::int;
  v_end := v_start + v_svc.duration_minutes;

  -- Dentro del horario del barbero ese día
  IF NOT EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.barber_id = _barber_id AND s.active AND s.day_of_week = extract(dow FROM _date)::int
      AND v_start >= (extract(epoch FROM s.start_time) / 60)::int
      AND v_end <= (extract(epoch FROM s.end_time) / 60)::int
  ) THEN
    RAISE EXCEPTION 'outside_schedule' USING ERRCODE = '22023';
  END IF;

  -- Sin bloqueos (día completo o rango)
  IF EXISTS (
    SELECT 1 FROM public.barber_blocks b
    WHERE b.barber_id = _barber_id AND b.block_date = _date
      AND (b.start_time IS NULL
           OR (v_start < (extract(epoch FROM b.end_time) / 60)::int
               AND v_end > (extract(epoch FROM b.start_time) / 60)::int))
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = '23505';
  END IF;

  -- Serializa las reservas del mismo barbero y día (dos personas a la vez)
  PERFORM pg_advisory_xact_lock(hashtextextended(_barber_id::text || _date::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.barber_id = _barber_id AND a.appointment_date = _date AND a.status <> 'cancelado'
      AND v_start < (extract(epoch FROM a.appointment_time) / 60)::int + a.service_duration_minutes
      AND v_end > (extract(epoch FROM a.appointment_time) / 60)::int
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = '23505';
  END IF;

  -- Límites contra reservas masivas
  IF (SELECT count(*) FROM public.appointments a
      WHERE a.client_phone = v_phone AND a.status IN ('pendiente', 'confirmado')
        AND a.appointment_date >= v_now::date) >= 3 THEN
    RAISE EXCEPTION 'too_many_bookings' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.appointments a
      WHERE a.terms_version IS NOT NULL AND a.created_at > now() - INTERVAL '10 minutes') >= 30 THEN
    RAISE EXCEPTION 'busy_try_later' USING ERRCODE = '22023';
  END IF;

  -- Ficha del cliente
  IF auth.uid() IS NOT NULL THEN
    v_client_id := public.current_client_id();   -- cliente con tarjeta y sesión iniciada
  END IF;
  IF v_client_id IS NULL THEN
    SELECT * INTO v_client FROM public.clients WHERE phone = v_phone;
    IF v_client.id IS NOT NULL THEN
      -- Una ficha con tarjeta verificada solo recibe el turno si coincide el email verificado.
      -- Una ficha sin tarjeta con otro email cargado tampoco (lo vincula el personal).
      IF (v_client.user_id IS NULL AND (v_client.email IS NULL OR v_email IS NULL OR v_email = v_client.email))
         OR (v_client.user_id IS NOT NULL AND v_email IS NOT NULL AND v_email = v_client.email) THEN
        v_client_id := v_client.id;
      END IF;
    ELSE
      INSERT INTO public.clients (first_name, last_name, phone, email, source)
      VALUES (v_first, v_last, v_phone, v_email, 'booking')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id INTO v_client_id;
    END IF;
  END IF;

  INSERT INTO public.appointments (
    client_name, client_phone, client_email, client_id, service_id, service_name, service_price,
    service_duration_minutes, barber_id, appointment_date, appointment_time, status,
    terms_version, privacy_notice_version)
  VALUES (
    v_first || ' ' || v_last, v_phone, v_email, v_client_id, v_svc.id, v_svc.name, v_svc.price,
    v_svc.duration_minutes, _barber_id, _date, _time, 'pendiente',
    _terms_version, _privacy_notice_version)
  RETURNING id, cancel_token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token;
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. A1: ver y cancelar con el token del turno
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_appointments_by_tokens(_tokens UUID[])
RETURNS TABLE (
  token UUID, appointment_date DATE, appointment_time TIME,
  service_name TEXT, barber_name TEXT, status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.cancel_token, a.appointment_date, a.appointment_time, a.service_name,
         COALESCE(b.name, '—'), a.status::TEXT
  FROM public.appointments a
  LEFT JOIN public.barbers b ON b.id = a.barber_id
  WHERE a.cancel_token = ANY (_tokens[1:20])
    AND a.appointment_date >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 1
  ORDER BY a.appointment_date, a.appointment_time
$$;
REVOKE EXECUTE ON FUNCTION public.get_appointments_by_tokens(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointments_by_tokens(UUID[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_token(_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_status TEXT;
  v_starts TIMESTAMPTZ;
BEGIN
  SELECT id, status::TEXT,
         (appointment_date + appointment_time) AT TIME ZONE 'America/Argentina/Buenos_Aires'
  INTO v_id, v_status, v_starts
  FROM public.appointments
  WHERE cancel_token = _token
  FOR UPDATE;

  IF v_id IS NULL THEN RETURN FALSE; END IF;
  IF v_status IN ('cancelado', 'atendido') THEN RETURN FALSE; END IF;
  IF v_starts <= now() + INTERVAL '3 hours' THEN RETURN FALSE; END IF;

  UPDATE public.appointments SET status = 'cancelado' WHERE id = v_id;
  RETURN TRUE;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment_by_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. B5: bloqueos sin motivo para el público
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_full_day_blocked_dates(_barber_id UUID, _from DATE, _to DATE)
RETURNS TABLE (block_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT b.block_date FROM public.barber_blocks b
  WHERE b.barber_id = _barber_id AND b.start_time IS NULL
    AND b.block_date BETWEEN _from AND LEAST(_to, _from + 400)
$$;
REVOKE EXECUTE ON FUNCTION public.get_full_day_blocked_dates(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_full_day_blocked_dates(UUID, DATE, DATE) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. M1: el barbero solo cambia estado y notas de sus turnos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointments_barber_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sin sesión (service role, triggers internos, SQL) o admin: sin restricción
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'barber') AND (
       NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
    OR NEW.client_email IS DISTINCT FROM OLD.client_email
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.service_name IS DISTINCT FROM OLD.service_name
    OR NEW.service_price IS DISTINCT FROM OLD.service_price
    OR NEW.service_duration_minutes IS DISTINCT FROM OLD.service_duration_minutes
    OR NEW.barber_id IS DISTINCT FROM OLD.barber_id
    OR NEW.cancel_token IS DISTINCT FROM OLD.cancel_token) THEN
    RAISE EXCEPTION 'barber_cannot_change_field' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.appointments_barber_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS appointments_barber_guard ON public.appointments;
CREATE TRIGGER appointments_barber_guard
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_barber_guard();

-- ---------------------------------------------------------------------
-- 8. M2: finanzas solo para admin
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Barbers view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Barbers view cash closures" ON public.cash_closures;

-- ---------------------------------------------------------------------
-- 9. B3: sin auto-alta de admin y siempre queda al menos uno
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.keep_last_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE EXECUTE ON FUNCTION public.keep_last_admin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_keep_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_keep_last_admin
BEFORE DELETE OR UPDATE OF role ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.keep_last_admin();

-- ---------------------------------------------------------------------
-- 10. B7: el usuario solo edita su nombre
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------
-- 11. Reenvío de links por email: registro para limitar pedidos
--     (solo lo usa la edge function send-booking-links con service role)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_link_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_link_requests_email_idx ON public.booking_link_requests (email, created_at DESC);
ALTER TABLE public.booking_link_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_link_requests FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. Textos legales: email obligatorio en la reserva y link personal del turno
-- ---------------------------------------------------------------------
INSERT INTO public.legal_document_versions (version, document, published_on, summary) VALUES
  ('terminos-v3-2026-11', 'terms', DATE '2026-11-05',
   'La cancelación online se hace con el link personal del turno (mail de confirmación o el dispositivo donde se reservó).'),
  ('privacidad-v4-2026-11', 'privacy', DATE '2026-11-05',
   'El email pasa a ser obligatorio en la reserva: por ahí se envía el link para ver y cancelar el turno.')
ON CONFLICT (version) DO NOTHING;
