-- =====================================================================
-- CUMPLIMIENTO LEGAL: versiones de documentos, registro de aceptación,
-- minimización de datos y regla de cancelación en el servidor.
-- Ver docs/LEGAL.md. Desplegar en la misma ventana que el frontend: el
-- frontend nuevo envía terms_version y esta migración la exige en la reserva.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Versiones publicadas de Términos/Condiciones y Política de privacidad
-- ---------------------------------------------------------------------
CREATE TABLE public.legal_document_versions (
  version TEXT PRIMARY KEY,
  document TEXT NOT NULL CHECK (document IN ('terms', 'privacy')),
  published_on DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.legal_document_versions (version, document, published_on, summary) VALUES
  ('terminos-v2-2026-10', 'terms', DATE '2026-10-22',
   'Condiciones de reserva y de la tarjeta de fidelidad. Cancelación online hasta 3 h antes; no se cobra seña ni se paga online.'),
  ('privacidad-v2-2026-10', 'privacy', DATE '2026-10-22',
   'Reservas, tarjeta de fidelidad, consentimientos de email y WhatsApp, Supabase (EE.UU.), conservación propuesta.');

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view legal versions" ON public.legal_document_versions FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_document_versions FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Prueba de aceptación en la reserva web
--    Qué: versión de las condiciones aceptadas y del aviso de privacidad mostrado.
--    Cuándo: appointments.created_at. Quién: id del turno + teléfono/cliente.
--    Turnos cargados por el personal o anteriores a esta migración: NULL.
-- ---------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN terms_version TEXT REFERENCES public.legal_document_versions(version),
  ADD COLUMN privacy_notice_version TEXT REFERENCES public.legal_document_versions(version),
  ADD CONSTRAINT appointments_legal_versions_pair
    CHECK ((terms_version IS NULL) = (privacy_notice_version IS NULL));

-- Una reserva hecha sin sesión de personal debe traer las dos versiones
DROP POLICY IF EXISTS "Anyone create valid appointment" ON public.appointments;
CREATE POLICY "Anyone create valid appointment" ON public.appointments
FOR INSERT
WITH CHECK (
  length(trim(client_name)) BETWEEN 2 AND 100
  AND length(trim(client_phone)) BETWEEN 6 AND 25
  AND length(trim(service_name)) BETWEEN 1 AND 100
  AND appointment_date >= CURRENT_DATE
  AND status = 'pendiente'
  AND (public.is_staff(auth.uid()) OR (terms_version IS NOT NULL AND privacy_notice_version IS NOT NULL))
);

-- El registro de aceptación no se puede modificar después (ni por el personal)
CREATE OR REPLACE FUNCTION public.keep_legal_acceptance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.terms_version IS DISTINCT FROM OLD.terms_version
     OR NEW.privacy_notice_version IS DISTINCT FROM OLD.privacy_notice_version
     OR (OLD.terms_version IS NOT NULL AND NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'legal_acceptance_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_keep_legal_acceptance
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.keep_legal_acceptance();

-- ---------------------------------------------------------------------
-- 3. Tarjeta de fidelidad: aceptación de condiciones y WhatsApp opcional
-- ---------------------------------------------------------------------
ALTER TABLE public.loyalty_accounts
  ADD COLUMN terms_version TEXT REFERENCES public.legal_document_versions(version),
  ADD COLUMN privacy_notice_version TEXT REFERENCES public.legal_document_versions(version),
  ADD COLUMN terms_accepted_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT);
CREATE FUNCTION public.loyalty_register(
  _first_name TEXT, _whatsapp TEXT DEFAULT NULL, _last_name TEXT DEFAULT NULL,
  _birth_day SMALLINT DEFAULT NULL, _birth_month SMALLINT DEFAULT NULL,
  _marketing_opt_in BOOLEAN DEFAULT false, _consent_version TEXT DEFAULT NULL,
  _whatsapp_opt_in BOOLEAN DEFAULT false, _whatsapp_consent_version TEXT DEFAULT NULL,
  _terms_version TEXT DEFAULT NULL, _privacy_notice_version TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_wa TEXT := NULLIF(public.normalize_whatsapp(_whatsapp), '');
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'email_not_verified' USING ERRCODE = '42501'; END IF;

  SELECT id INTO v_id FROM public.clients WHERE user_id = v_uid;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.legal_document_versions WHERE version = _terms_version AND document = 'terms')
     OR NOT EXISTS (SELECT 1 FROM public.legal_document_versions WHERE version = _privacy_notice_version AND document = 'privacy') THEN
    RAISE EXCEPTION 'terms_not_accepted' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  -- El WhatsApp es opcional; solo es obligatorio para aceptar mensajes por ese canal
  IF v_wa IS NOT NULL AND v_wa !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;
  IF _whatsapp_opt_in AND v_wa IS NULL THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;
  IF _marketing_opt_in AND NOT EXISTS (
    SELECT 1 FROM public.marketing_consent_texts WHERE version = _consent_version AND channel = 'email') THEN
    RAISE EXCEPTION 'unknown_consent_version' USING ERRCODE = '22023';
  END IF;
  IF _whatsapp_opt_in AND NOT EXISTS (
    SELECT 1 FROM public.marketing_consent_texts WHERE version = _whatsapp_consent_version AND channel = 'whatsapp') THEN
    RAISE EXCEPTION 'unknown_consent_version' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.clients (first_name, last_name, email, whatsapp, birth_day, birth_month, user_id, source)
  VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), v_email, v_wa,
          _birth_day, _birth_month, v_uid, 'loyalty_signup')
  RETURNING id INTO v_id;

  INSERT INTO public.loyalty_accounts (client_id, terms_version, privacy_notice_version, terms_accepted_at)
  VALUES (v_id, _terms_version, _privacy_notice_version, now());
  INSERT INTO public.loyalty_events (client_id, event_type, actor_id) VALUES (v_id, 'client_registered', v_uid);

  IF _marketing_opt_in THEN
    INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
    VALUES (v_id, true, v_email, _consent_version, 'signup', v_uid);
  END IF;
  IF _whatsapp_opt_in THEN
    INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
    VALUES (v_id, true, v_wa, _whatsapp_consent_version, 'signup', v_uid);
  END IF;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _first_name TEXT, _last_name TEXT, _birth_day SMALLINT, _birth_month SMALLINT, _whatsapp TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := public.current_client_id();
  v_wa TEXT := NULLIF(public.normalize_whatsapp(_whatsapp), '');
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_loyalty_card' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NOT NULL AND v_wa !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;
  -- Sin número no puede quedar vigente la suscripción a WhatsApp
  IF v_wa IS NULL AND public.client_channel_opt_in(v_id, 'whatsapp') THEN
    RAISE EXCEPTION 'whatsapp_required_for_opt_in' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clients
  SET first_name = trim(_first_name), last_name = NULLIF(trim(coalesce(_last_name, '')), ''),
      birth_day = _birth_day, birth_month = _birth_month, whatsapp = v_wa
  WHERE id = v_id;
END; $$;

-- ---------------------------------------------------------------------
-- 4. Búsqueda por teléfono en la reserva pública: solo el id
--    Antes devolvía nombre, apellido, email y fecha de nacimiento a
--    cualquiera que escribiera un teléfono.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_client_by_phone(TEXT);
CREATE FUNCTION public.get_client_by_phone(_phone TEXT)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.clients c WHERE c.phone = _phone LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_client_by_phone(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Cancelación online: hasta 3 h antes, igual que lo que muestra /mi-turno
--    (antes solo lo controlaba la pantalla)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_appointment(_phone TEXT, _appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_starts TIMESTAMPTZ;
BEGIN
  SELECT status::TEXT,
         (appointment_date + appointment_time) AT TIME ZONE 'America/Argentina/Buenos_Aires'
  INTO v_status, v_starts
  FROM public.appointments
  WHERE id = _appointment_id AND client_phone = _phone;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_status IN ('cancelado', 'atendido') THEN RETURN FALSE; END IF;
  IF v_starts <= now() + INTERVAL '3 hours' THEN RETURN FALSE; END IF;

  UPDATE public.appointments
  SET status = 'cancelado'
  WHERE id = _appointment_id AND client_phone = _phone;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_my_appointment(TEXT, UUID) TO anon, authenticated;
