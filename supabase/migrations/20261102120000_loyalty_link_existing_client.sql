-- =====================================================================
-- FIDELIDAD: el alta reutiliza la ficha que el cliente ya tiene por sus turnos
-- =====================================================================
-- Antes, crear la tarjeta siempre insertaba una ficha nueva: el cliente quedaba
-- duplicado y sus turnos siguientes (buscados por teléfono) iban a la ficha vieja,
-- sin sumar en la tarjeta.
--
-- Ahora, con el email YA VERIFICADO (código por email):
-- * loyalty_prefill() devuelve nombre, apellido, WhatsApp/teléfono y cumpleaños de
--   la ficha con ese email, para precargar el formulario. Nadie ve datos sin
--   verificar el email antes.
-- * loyalty_register() le pone la tarjeta a esa misma ficha (sin duplicar).
-- Los turnos anteriores NO se acreditan: la tarjeta cuenta desde loyalty_start_date().

-- Ficha sin tarjeta con el email verificado del usuario actual (la de turnos más recientes)
CREATE OR REPLACE FUNCTION public._loyalty_existing_client(_email TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
  FROM public.clients c
  WHERE c.email = lower(trim(_email)) AND c.user_id IS NULL
  ORDER BY (SELECT max(a.appointment_date) FROM public.appointments a WHERE a.client_id = c.id) DESC NULLS LAST,
           c.created_at DESC
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public._loyalty_existing_client(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.loyalty_prefill()
RETURNS TABLE (first_name TEXT, last_name TEXT, whatsapp TEXT, birth_day SMALLINT, birth_month SMALLINT)
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
    SELECT c.first_name, c.last_name, coalesce(c.whatsapp, c.phone), c.birth_day, c.birth_month
    FROM public.clients c WHERE c.id = v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.loyalty_prefill() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_prefill() TO authenticated;

CREATE OR REPLACE FUNCTION public.loyalty_register(
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
        birth_month = coalesce(_birth_month, birth_month)
    WHERE id = v_id;
  ELSE
    INSERT INTO public.clients (first_name, last_name, email, whatsapp, birth_day, birth_month, user_id, source)
    VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), v_email, v_wa,
            _birth_day, _birth_month, v_uid, 'loyalty_signup')
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
