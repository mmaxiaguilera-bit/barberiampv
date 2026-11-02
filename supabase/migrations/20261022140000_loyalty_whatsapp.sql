-- =====================================================================
-- FIDELIZACIÓN: WhatsApp obligatorio en la tarjeta + consentimiento por canal
-- =====================================================================
-- * clients.whatsapp: número de contacto de la tarjeta (no único: puede
--   coincidir con el teléfono de reservas de otra ficha sin unirlas solas).
-- * Consentimientos separados por canal (email / whatsapp), cada uno con su
--   texto versionado. El estado vigente es el último registro de cada canal.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp TEXT
  CHECK (whatsapp IS NULL OR whatsapp ~ '^\+?[0-9]{10,15}$');
CREATE INDEX IF NOT EXISTS clients_whatsapp_idx ON public.clients (whatsapp);

ALTER TABLE public.marketing_consent_texts
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp'));
INSERT INTO public.marketing_consent_texts (version, text, channel)
VALUES ('wa-v1-2026-10', 'Quiero recibir por WhatsApp avisos de mi tarjeta y promociones', 'whatsapp')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.marketing_consents
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp'));
-- Orden exacto de los registros (varios en la misma transacción comparten created_at)
ALTER TABLE public.marketing_consents ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS marketing_consents_channel_idx ON public.marketing_consents (client_id, channel, seq DESC);

-- El canal del registro siempre es el del texto aceptado
CREATE OR REPLACE FUNCTION public.set_consent_channel()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT channel INTO NEW.channel FROM public.marketing_consent_texts WHERE version = NEW.text_version;
  RETURN NEW;
END; $$;
CREATE TRIGGER marketing_consents_channel
BEFORE INSERT ON public.marketing_consents
FOR EACH ROW EXECUTE FUNCTION public.set_consent_channel();
REVOKE EXECUTE ON FUNCTION public.set_consent_channel() FROM PUBLIC, anon, authenticated;

-- Normaliza un número: deja dígitos y un "+" inicial
CREATE OR REPLACE FUNCTION public.normalize_whatsapp(_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(
    CASE WHEN trim(coalesce(_raw, '')) LIKE '+%' THEN '+' ELSE '' END
    || regexp_replace(coalesce(_raw, ''), '[^0-9]', '', 'g'), '')
$$;

-- ---------------------------------------------------------------------
-- Estado vigente por canal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_channel_opt_in(_client_id UUID, _channel TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT granted FROM public.marketing_consents
    WHERE client_id = _client_id AND channel = _channel
    ORDER BY seq DESC LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.client_marketing_opt_in(_client_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.client_channel_opt_in(_client_id, 'email')
$$;

-- ---------------------------------------------------------------------
-- Alta de tarjeta: ahora exige WhatsApp y registra ambos consentimientos
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.loyalty_register(TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT);
CREATE FUNCTION public.loyalty_register(
  _first_name TEXT, _whatsapp TEXT, _last_name TEXT DEFAULT NULL,
  _birth_day SMALLINT DEFAULT NULL, _birth_month SMALLINT DEFAULT NULL,
  _marketing_opt_in BOOLEAN DEFAULT false, _consent_version TEXT DEFAULT NULL,
  _whatsapp_opt_in BOOLEAN DEFAULT false, _whatsapp_consent_version TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_wa TEXT := public.normalize_whatsapp(_whatsapp);
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'email_not_verified' USING ERRCODE = '42501'; END IF;

  SELECT id INTO v_id FROM public.clients WHERE user_id = v_uid;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NULL OR v_wa !~ '^\+?[0-9]{10,15}$' THEN
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

  INSERT INTO public.loyalty_accounts (client_id) VALUES (v_id);
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

DROP FUNCTION IF EXISTS public.update_my_profile(TEXT, TEXT, SMALLINT, SMALLINT);
CREATE FUNCTION public.update_my_profile(
  _first_name TEXT, _last_name TEXT, _birth_day SMALLINT, _birth_month SMALLINT, _whatsapp TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := public.current_client_id();
  v_wa TEXT := public.normalize_whatsapp(_whatsapp);
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_loyalty_card' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NULL OR v_wa !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clients
  SET first_name = trim(_first_name), last_name = NULLIF(trim(coalesce(_last_name, '')), ''),
      birth_day = _birth_day, birth_month = _birth_month, whatsapp = v_wa
  WHERE id = v_id;
END; $$;

-- El canal sale de la versión del texto; guarda el email o el WhatsApp según corresponda
CREATE OR REPLACE FUNCTION public.set_my_marketing_consent(_granted BOOLEAN, _consent_version TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := public.current_client_id();
  v_channel TEXT;
  v_contact TEXT;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_loyalty_card' USING ERRCODE = '42501'; END IF;
  SELECT channel INTO v_channel FROM public.marketing_consent_texts WHERE version = _consent_version;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'unknown_consent_version' USING ERRCODE = '22023'; END IF;
  IF public.client_channel_opt_in(v_id, v_channel) = _granted THEN RETURN; END IF;
  SELECT CASE WHEN v_channel = 'whatsapp' THEN whatsapp ELSE email END INTO v_contact FROM public.clients WHERE id = v_id;
  IF _granted AND v_contact IS NULL THEN RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  VALUES (v_id, _granted, v_contact, _consent_version, 'customer_panel', auth.uid());
END; $$;

-- Las bajas por link y por el personal son del canal email
CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
BEGIN
  SELECT id, email INTO v_id, v_email FROM public.clients WHERE unsubscribe_token = _token;
  IF v_id IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.client_channel_opt_in(v_id, 'email') THEN RETURN TRUE; END IF;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source)
  SELECT v_id, false, v_email, text_version, 'unsubscribe_link' FROM public.marketing_consents
  WHERE client_id = v_id AND channel = 'email' ORDER BY seq DESC LIMIT 1;
  RETURN TRUE;
END; $$;

DROP FUNCTION IF EXISTS public.staff_record_unsubscribe(UUID);
CREATE FUNCTION public.staff_record_unsubscribe(_client_id UUID, _channel TEXT DEFAULT 'email')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _channel NOT IN ('email', 'whatsapp') THEN RAISE EXCEPTION 'invalid_channel' USING ERRCODE = '22023'; END IF;
  IF NOT public.client_channel_opt_in(_client_id, _channel) THEN RETURN; END IF;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  SELECT _client_id, false, mc.email, mc.text_version, 'staff', auth.uid() FROM public.marketing_consents mc
  WHERE mc.client_id = _client_id AND mc.channel = _channel ORDER BY mc.seq DESC LIMIT 1;
END; $$;

-- Exportación para email marketing: solo consentimiento de email vigente.
-- Incluye el WhatsApp y si aceptó ese canal, para futuras automatizaciones.
DROP FUNCTION IF EXISTS public.admin_export_marketing_contacts();
CREATE FUNCTION public.admin_export_marketing_contacts()
RETURNS TABLE (
  first_name TEXT, last_name TEXT, email TEXT, whatsapp TEXT, whatsapp_opt_in BOOLEAN, birthday TEXT,
  consent_at TIMESTAMPTZ, consent_source TEXT, consent_version TEXT, consent_text TEXT, unsubscribe_token UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (mc.client_id) mc.*
    FROM public.marketing_consents mc
    WHERE mc.channel = 'email'
    ORDER BY mc.client_id, mc.seq DESC
  )
  SELECT c.first_name, c.last_name, c.email, c.whatsapp, public.client_channel_opt_in(c.id, 'whatsapp'),
         CASE
           WHEN c.birth_day IS NOT NULL THEN lpad(c.birth_day::text, 2, '0') || '/' || lpad(c.birth_month::text, 2, '0')
           WHEN c.birth_date IS NOT NULL THEN to_char(c.birth_date, 'DD/MM')
         END,
         l.created_at, l.source, l.text_version, t.text, c.unsubscribe_token
  FROM latest l
  JOIN public.clients c ON c.id = l.client_id
  JOIN public.marketing_consent_texts t ON t.version = l.text_version
  WHERE l.granted AND c.user_id IS NOT NULL AND c.email IS NOT NULL
  ORDER BY c.first_name, c.last_name;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.data_export_log (export_type, row_count, exported_by)
  VALUES ('marketing_contacts', v_count, auth.uid());
END; $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT),
  public.update_my_profile(TEXT, TEXT, SMALLINT, SMALLINT, TEXT),
  public.staff_record_unsubscribe(UUID, TEXT),
  public.admin_export_marketing_contacts(),
  public.client_channel_opt_in(UUID, TEXT),
  public.client_marketing_opt_in(UUID)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_channel_opt_in(UUID, TEXT), public.client_marketing_opt_in(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION
  public.loyalty_register(TEXT, TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT, BOOLEAN, TEXT),
  public.update_my_profile(TEXT, TEXT, SMALLINT, SMALLINT, TEXT),
  public.staff_record_unsubscribe(UUID, TEXT),
  public.admin_export_marketing_contacts()
TO authenticated;
