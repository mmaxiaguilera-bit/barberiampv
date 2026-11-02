-- =====================================================================
-- FIDELIDAD: año de nacimiento opcional y protección de menores
-- =====================================================================
-- * clients.birth_year (opcional, solo junto con día y mes).
-- * Menor de 18 (por fecha completa): no puede aceptar promociones por su cuenta.
--   Lo controla loyalty_register y un trigger en marketing_consents (alta propia).
--   El personal sí puede registrarlas (ej. con autorización de madre/padre en el local).
-- * Política de privacidad v3 (menciona el año y el control de menores).

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_year SMALLINT
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);

CREATE OR REPLACE FUNCTION public.valid_birth_date(_day SMALLINT, _month SMALLINT, _year SMALLINT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _day IS NULL OR _month IS NULL OR _year IS NULL THEN RETURN false; END IF;
  PERFORM make_date(_year, _month, _day);
  RETURN _year >= 1900;
EXCEPTION WHEN others THEN RETURN false;
END; $$;

-- Menor de 18 hoy (hora de Argentina). Sin fecha completa no se puede saber: false.
CREATE OR REPLACE FUNCTION public.is_minor(_day SMALLINT, _month SMALLINT, _year SMALLINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT public.valid_birth_date(_day, _month, _year)
     AND make_date(_year, _month, _day) > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '18 years')
$$;
GRANT EXECUTE ON FUNCTION public.valid_birth_date(SMALLINT, SMALLINT, SMALLINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_minor(SMALLINT, SMALLINT, SMALLINT) TO anon, authenticated;

-- Consentimiento propio de un menor: bloqueado (cubre alta, panel y cualquier otra vía)
CREATE OR REPLACE FUNCTION public.block_minor_self_consent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients;
BEGIN
  IF NOT NEW.granted THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.clients WHERE id = NEW.client_id;
  IF c.user_id IS NOT NULL AND NEW.actor_id = c.user_id
     AND public.is_minor(c.birth_day, c.birth_month, c.birth_year) THEN
    RAISE EXCEPTION 'minor_marketing_not_allowed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS marketing_consents_block_minor ON public.marketing_consents;
CREATE TRIGGER marketing_consents_block_minor
BEFORE INSERT ON public.marketing_consents
FOR EACH ROW EXECUTE FUNCTION public.block_minor_self_consent();

INSERT INTO public.legal_document_versions (version, document, published_on, summary) VALUES
  ('privacidad-v3-2026-11', 'privacy', DATE '2026-11-02',
   'Agrega el año de nacimiento opcional en la tarjeta y la regla de menores de 18 para promociones.')
ON CONFLICT (version) DO NOTHING;

-- Precarga: ahora también el año
DROP FUNCTION IF EXISTS public.loyalty_prefill();
CREATE FUNCTION public.loyalty_prefill()
RETURNS TABLE (first_name TEXT, last_name TEXT, whatsapp TEXT, birth_day SMALLINT, birth_month SMALLINT, birth_year SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_id UUID;
BEGIN
  SELECT lower(u.email) INTO v_email FROM auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN; END IF;
  v_id := public._loyalty_existing_client(v_email);
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.first_name, c.last_name, coalesce(c.whatsapp, c.phone), c.birth_day, c.birth_month, c.birth_year
    FROM public.clients c WHERE c.id = v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_prefill() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_prefill() TO authenticated;

-- Alta: nuevo parámetro _birth_year (cambia la firma)
DROP FUNCTION IF EXISTS public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT);
CREATE FUNCTION public.loyalty_register(
  _first_name TEXT, _whatsapp TEXT DEFAULT NULL, _last_name TEXT DEFAULT NULL,
  _birth_day SMALLINT DEFAULT NULL, _birth_month SMALLINT DEFAULT NULL,
  _marketing_opt_in BOOLEAN DEFAULT false, _consent_version TEXT DEFAULT NULL,
  _whatsapp_opt_in BOOLEAN DEFAULT false, _whatsapp_consent_version TEXT DEFAULT NULL,
  _terms_version TEXT DEFAULT NULL, _privacy_notice_version TEXT DEFAULT NULL,
  _birth_year SMALLINT DEFAULT NULL
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

  -- Cumpleaños: día y mes opcionales; el año solo junto con día y mes
  IF (_birth_day IS NULL) <> (_birth_month IS NULL)
     OR (_birth_year IS NOT NULL AND _birth_day IS NULL)
     OR (_birth_year IS NOT NULL AND NOT public.valid_birth_date(_birth_day, _birth_month, _birth_year)) THEN
    RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = '22023';
  END IF;
  -- Menores de 18: sin promociones por autoconsentimiento (requieren autorización adulta)
  IF public.is_minor(_birth_day, _birth_month, _birth_year) AND (_marketing_opt_in OR _whatsapp_opt_in) THEN
    RAISE EXCEPTION 'minor_marketing_not_allowed' USING ERRCODE = '22023';
  END IF;

  -- ¿Ya es cliente por sus turnos? Se usa esa ficha (bloqueada contra altas simultáneas)
  SELECT c.id INTO v_id FROM public.clients c
  WHERE c.id = public._loyalty_existing_client(v_email) AND c.user_id IS NULL
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE public.clients
    SET user_id = v_uid,
        first_name = trim(_first_name),
        last_name = coalesce(NULLIF(trim(coalesce(_last_name, '')), ''), last_name),
        whatsapp = coalesce(v_wa, whatsapp),
        birth_day = coalesce(_birth_day, birth_day),
        birth_month = coalesce(_birth_month, birth_month),
        birth_year = coalesce(_birth_year, birth_year)
    WHERE id = v_id;
  ELSE
    INSERT INTO public.clients (first_name, last_name, email, whatsapp, birth_day, birth_month, birth_year, user_id, source)
    VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), v_email, v_wa,
            _birth_day, _birth_month, _birth_year, v_uid, 'loyalty_signup')
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.loyalty_accounts (client_id, terms_version, privacy_notice_version, terms_accepted_at)
  VALUES (v_id, _terms_version, _privacy_notice_version, now())
  ON CONFLICT (client_id) DO UPDATE
    SET terms_version = EXCLUDED.terms_version,
        privacy_notice_version = EXCLUDED.privacy_notice_version,
        terms_accepted_at = EXCLUDED.terms_accepted_at;
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
REVOKE EXECUTE ON FUNCTION public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, SMALLINT) TO authenticated;
