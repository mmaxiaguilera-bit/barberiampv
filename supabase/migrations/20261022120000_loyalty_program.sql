-- =====================================================================
-- FIDELIZACIÓN: tarjeta digital, visitas, premios y consentimiento
-- =====================================================================
-- Reglas (ver también PROYECTO.md → "Programa de fidelidad"):
--  * Una reserva NO suma. Suma una visita cuando el personal marca el turno
--    como "atendido" (trigger) o registra un walk-in con cliente (RPC).
--  * Cada turno / cobro suma una sola vez (índices únicos parciales).
--  * Al llegar a visits_required se genera un premio y el ciclo descuenta
--    esa cantidad. Los premios guardan una copia de las condiciones vigentes.
--  * Una atención en la que se canjea un premio también suma visita.
--  * Cambiar las reglas crea una versión nueva del programa: aplica al ciclo
--    en curso desde la próxima visita; los premios ya ganados no cambian.
--  * Revertir una visita: si el ciclo actual tiene visitas, descuenta una.
--    Si el ciclo está en 0 porque se acaba de ganar un premio: si el premio
--    está disponible se anula y el ciclo se restaura; si ya se canjeó se
--    mantiene y el ciclo queda en negativo (debe una visita).
--  * Los clientes nunca escriben directo en estas tablas: todo pasa por
--    funciones SECURITY DEFINER que validan rol y dejan auditoría.

-- ---------------------------------------------------------------------
-- 1. CLIENTS: identidad autenticada y datos de la tarjeta
-- ---------------------------------------------------------------------
ALTER TABLE public.clients ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN last_name DROP NOT NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS birth_day SMALLINT CHECK (birth_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS birth_month SMALLINT CHECK (birth_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'booking'
    CHECK (source IN ('booking', 'loyalty_signup', 'staff')),
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid();

ALTER TABLE public.clients
  ADD CONSTRAINT clients_birthday_pair CHECK ((birth_day IS NULL) = (birth_month IS NULL)),
  ADD CONSTRAINT clients_birthday_valid CHECK (
    birth_day IS NULL OR birth_day <= CASE
      WHEN birth_month IN (4, 6, 9, 11) THEN 30
      WHEN birth_month = 2 THEN 29
      ELSE 31 END
  );

-- Emails siempre normalizados (minúsculas, sin espacios, vacío = NULL)
CREATE OR REPLACE FUNCTION public.normalize_client_email()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := NULLIF(lower(trim(NEW.email)), '');
  RETURN NEW;
END; $$;

CREATE TRIGGER clients_normalize_email
BEFORE INSERT OR UPDATE OF email ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.normalize_client_email();

UPDATE public.clients SET email = email WHERE email IS NOT NULL;

-- Un solo cliente con cuenta verificada por email. Los emails cargados en
-- reservas (sin verificar) pueden repetirse y no se unen automáticamente.
CREATE UNIQUE INDEX clients_verified_email_key ON public.clients (email) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_email_idx ON public.clients (email);

-- ---------------------------------------------------------------------
-- 2. HELPERS DE ROL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'barber'))
$$;

CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid() AND auth.uid() IS NOT NULL
$$;

-- Clientes ven solo su propia ficha (staff ya tiene sus políticas)
CREATE POLICY "Customer views own client" ON public.clients FOR SELECT
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. PROGRAMA (versionado: un solo activo)
-- ---------------------------------------------------------------------
CREATE TABLE public.loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  visits_required INT NOT NULL CHECK (visits_required BETWEEN 1 AND 100),
  reward_description TEXT NOT NULL CHECK (length(trim(reward_description)) BETWEEN 3 AND 200),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX loyalty_programs_one_active ON public.loyalty_programs (active) WHERE active;

INSERT INTO public.loyalty_programs (name, visits_required, reward_description, is_demo)
VALUES ('Programa DEMO', 10, 'DEMO — beneficio a definir por MVP Barber', true);

-- ---------------------------------------------------------------------
-- 4. CUENTA, VISITAS, PREMIOS, AUDITORÍA
-- ---------------------------------------------------------------------
CREATE TABLE public.loyalty_accounts (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  total_visits INT NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
  -- Puede quedar negativo si se revierte una visita de un premio ya canjeado
  cycle_visits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('appointment', 'walk_in', 'manual')),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  service_name TEXT,
  barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL,
  program_id UUID REFERENCES public.loyalty_programs(id),
  reason TEXT,
  credited_by UUID,
  credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID,
  reversal_reason TEXT,
  CONSTRAINT loyalty_visits_manual_reason CHECK (source <> 'manual' OR length(trim(reason)) >= 3),
  CONSTRAINT loyalty_visits_reversal CHECK ((reversed_at IS NULL) = (reversal_reason IS NULL))
);
-- Acreditación única por turno y por cobro (doble clic, reintentos, concurrencia)
CREATE UNIQUE INDEX loyalty_visits_one_per_appointment ON public.loyalty_visits (appointment_id)
  WHERE reversed_at IS NULL AND appointment_id IS NOT NULL;
CREATE UNIQUE INDEX loyalty_visits_one_per_payment ON public.loyalty_visits (payment_id)
  WHERE reversed_at IS NULL AND payment_id IS NOT NULL;
CREATE INDEX loyalty_visits_client_idx ON public.loyalty_visits (client_id, visit_date DESC);

CREATE TABLE public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.loyalty_programs(id),
  -- Copia de las condiciones al momento de ganarlo
  visits_required INT NOT NULL,
  reward_description TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  earned_visit_id UUID REFERENCES public.loyalty_visits(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'voided')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID,
  redeemed_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  redemption_note TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT,
  CONSTRAINT loyalty_rewards_redeemed CHECK ((status = 'redeemed') = (redeemed_at IS NOT NULL)),
  CONSTRAINT loyalty_rewards_voided CHECK ((status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE INDEX loyalty_rewards_client_idx ON public.loyalty_rewards (client_id, earned_at DESC);

CREATE TABLE public.loyalty_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'client_registered', 'visit_credited', 'visit_reversed', 'reward_earned',
    'reward_redeemed', 'reward_voided', 'program_changed', 'clients_merged',
    'appointment_linked', 'consent_changed'
  )),
  visit_id UUID,
  reward_id UUID,
  actor_id UUID,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_events_client_idx ON public.loyalty_events (client_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. CONSENTIMIENTO DE MARKETING (historial, nunca se edita)
-- ---------------------------------------------------------------------
CREATE TABLE public.marketing_consent_texts (
  version TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.marketing_consent_texts (version, text)
VALUES ('v1-2026-10', 'Quiero recibir novedades, promociones y beneficios por email');

CREATE TABLE public.marketing_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  email TEXT,
  text_version TEXT NOT NULL REFERENCES public.marketing_consent_texts(version),
  source TEXT NOT NULL CHECK (source IN ('signup', 'customer_panel', 'unsubscribe_link', 'staff')),
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX marketing_consents_client_idx ON public.marketing_consents (client_id, created_at DESC);

CREATE TABLE public.data_export_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  export_type TEXT NOT NULL,
  row_count INT NOT NULL,
  exported_by UUID NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado vigente = último registro
CREATE OR REPLACE FUNCTION public.client_marketing_opt_in(_client_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT granted FROM public.marketing_consents
    WHERE client_id = _client_id ORDER BY created_at DESC, id DESC LIMIT 1
  ), false)
$$;

-- ---------------------------------------------------------------------
-- 6. RLS: lectura propia para clientes, lectura para staff, sin escritura directa
-- ---------------------------------------------------------------------
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view loyalty programs" ON public.loyalty_programs FOR SELECT USING (true);
CREATE POLICY "Anyone view consent texts" ON public.marketing_consent_texts FOR SELECT USING (true);

CREATE POLICY "Own or staff view loyalty account" ON public.loyalty_accounts FOR SELECT
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());
CREATE POLICY "Own or staff view loyalty visits" ON public.loyalty_visits FOR SELECT
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());
CREATE POLICY "Own or staff view loyalty rewards" ON public.loyalty_rewards FOR SELECT
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());
CREATE POLICY "Own or staff view consents" ON public.marketing_consents FOR SELECT
  USING (public.is_staff(auth.uid()) OR client_id = public.current_client_id());
CREATE POLICY "Admins view loyalty events" ON public.loyalty_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins view export log" ON public.data_export_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.loyalty_programs, public.loyalty_accounts, public.loyalty_visits, public.loyalty_rewards,
  public.loyalty_events, public.marketing_consent_texts, public.marketing_consents, public.data_export_log
FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. NÚCLEO (interno: no ejecutable desde la API)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._loyalty_credit(
  _client_id UUID, _source TEXT, _appointment_id UUID, _payment_id UUID,
  _service_name TEXT, _barber_id UUID, _visit_date DATE, _reason TEXT, _actor UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acc public.loyalty_accounts;
  v_prog public.loyalty_programs;
  v_visit_id UUID;
  v_reward_id UUID;
  v_cycle INT;
BEGIN
  INSERT INTO public.loyalty_accounts (client_id) VALUES (_client_id) ON CONFLICT DO NOTHING;
  -- Serializa todas las operaciones del mismo cliente
  SELECT * INTO v_acc FROM public.loyalty_accounts WHERE client_id = _client_id FOR UPDATE;
  SELECT * INTO v_prog FROM public.loyalty_programs WHERE active;

  INSERT INTO public.loyalty_visits (client_id, source, appointment_id, payment_id, service_name,
                                     barber_id, visit_date, program_id, reason, credited_by)
  VALUES (_client_id, _source, _appointment_id, _payment_id, _service_name,
          _barber_id, _visit_date, v_prog.id, _reason, _actor)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_visit_id;

  IF v_visit_id IS NULL THEN RETURN NULL; END IF;  -- ya estaba acreditada

  INSERT INTO public.loyalty_events (client_id, event_type, visit_id, actor_id, reason, details)
  VALUES (_client_id, 'visit_credited', v_visit_id, _actor, _reason,
          jsonb_build_object('source', _source, 'appointment_id', _appointment_id, 'payment_id', _payment_id));

  v_cycle := v_acc.cycle_visits + 1;
  IF v_prog.id IS NOT NULL THEN
    WHILE v_cycle >= v_prog.visits_required LOOP
      INSERT INTO public.loyalty_rewards (client_id, program_id, visits_required, reward_description, is_demo, earned_visit_id)
      VALUES (_client_id, v_prog.id, v_prog.visits_required, v_prog.reward_description, v_prog.is_demo, v_visit_id)
      RETURNING id INTO v_reward_id;
      INSERT INTO public.loyalty_events (client_id, event_type, visit_id, reward_id, actor_id)
      VALUES (_client_id, 'reward_earned', v_visit_id, v_reward_id, _actor);
      v_cycle := v_cycle - v_prog.visits_required;
    END LOOP;
  END IF;

  UPDATE public.loyalty_accounts
  SET total_visits = total_visits + 1, cycle_visits = v_cycle, updated_at = now()
  WHERE client_id = _client_id;

  RETURN v_visit_id;
END; $$;

CREATE OR REPLACE FUNCTION public._loyalty_reverse(_visit_id UUID, _reason TEXT, _actor UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client UUID;
  v_acc public.loyalty_accounts;
  v_visit public.loyalty_visits;
  v_reward public.loyalty_rewards;
  v_cycle INT;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  SELECT client_id INTO v_client FROM public.loyalty_visits WHERE id = _visit_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'visit_not_found' USING ERRCODE = 'P0002'; END IF;

  -- Mismo orden de bloqueo que _loyalty_credit: cuenta → visita
  SELECT * INTO v_acc FROM public.loyalty_accounts WHERE client_id = v_client FOR UPDATE;
  SELECT * INTO v_visit FROM public.loyalty_visits WHERE id = _visit_id FOR UPDATE;
  IF v_visit.reversed_at IS NOT NULL THEN RETURN FALSE; END IF;

  UPDATE public.loyalty_visits
  SET reversed_at = now(), reversed_by = _actor, reversal_reason = trim(_reason)
  WHERE id = _visit_id;

  IF v_acc.cycle_visits >= 1 THEN
    v_cycle := v_acc.cycle_visits - 1;
  ELSE
    SELECT * INTO v_reward FROM public.loyalty_rewards
    WHERE client_id = v_client AND status <> 'voided'
    ORDER BY (status = 'available') DESC, earned_at DESC, id DESC
    LIMIT 1 FOR UPDATE;

    IF FOUND AND v_reward.status = 'available' THEN
      UPDATE public.loyalty_rewards
      SET status = 'voided', voided_at = now(), voided_by = _actor,
          void_reason = 'Anulado al revertir una visita: ' || trim(_reason)
      WHERE id = v_reward.id;
      INSERT INTO public.loyalty_events (client_id, event_type, visit_id, reward_id, actor_id, reason)
      VALUES (v_client, 'reward_voided', _visit_id, v_reward.id, _actor, trim(_reason));
      v_cycle := v_acc.cycle_visits + v_reward.visits_required - 1;
    ELSE
      v_cycle := v_acc.cycle_visits - 1;
    END IF;
  END IF;

  UPDATE public.loyalty_accounts
  SET total_visits = GREATEST(total_visits - 1, 0), cycle_visits = v_cycle, updated_at = now()
  WHERE client_id = v_client;

  INSERT INTO public.loyalty_events (client_id, event_type, visit_id, actor_id, reason)
  VALUES (v_client, 'visit_reversed', _visit_id, _actor, trim(_reason));
  RETURN TRUE;
END; $$;

-- Acredita / revierte según el estado del turno, sin importar desde qué pantalla se cambie
CREATE OR REPLACE FUNCTION public.loyalty_on_appointment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NEW.status = 'atendido' AND NEW.client_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'atendido') THEN
    PERFORM public._loyalty_credit(NEW.client_id, 'appointment', NEW.id, NULL, NEW.service_name,
                                   NEW.barber_id, NEW.appointment_date, NULL, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'atendido' AND NEW.status <> 'atendido' THEN
    FOR v_id IN SELECT id FROM public.loyalty_visits WHERE appointment_id = NEW.id AND reversed_at IS NULL LOOP
      PERFORM public._loyalty_reverse(v_id, 'Turno cambiado de atendido a ' || NEW.status, auth.uid());
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER appointments_loyalty
AFTER INSERT OR UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.loyalty_on_appointment_status();

-- ---------------------------------------------------------------------
-- 8. API DEL CLIENTE
-- ---------------------------------------------------------------------
-- Crea (o devuelve) la tarjeta del usuario autenticado. El email sale de la
-- sesión verificada, nunca de un parámetro.
CREATE OR REPLACE FUNCTION public.loyalty_register(
  _first_name TEXT, _last_name TEXT DEFAULT NULL,
  _birth_day SMALLINT DEFAULT NULL, _birth_month SMALLINT DEFAULT NULL,
  _marketing_opt_in BOOLEAN DEFAULT false, _consent_version TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
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

  INSERT INTO public.clients (first_name, last_name, email, birth_day, birth_month, user_id, source)
  VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), v_email,
          _birth_day, _birth_month, v_uid, 'loyalty_signup')
  RETURNING id INTO v_id;

  INSERT INTO public.loyalty_accounts (client_id) VALUES (v_id);
  INSERT INTO public.loyalty_events (client_id, event_type, actor_id) VALUES (v_id, 'client_registered', v_uid);

  IF _marketing_opt_in THEN
    IF NOT EXISTS (SELECT 1 FROM public.marketing_consent_texts WHERE version = _consent_version) THEN
      RAISE EXCEPTION 'unknown_consent_version' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
    VALUES (v_id, true, v_email, _consent_version, 'signup', v_uid);
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _first_name TEXT, _last_name TEXT, _birth_day SMALLINT, _birth_month SMALLINT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID := public.current_client_id();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_loyalty_card' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clients
  SET first_name = trim(_first_name), last_name = NULLIF(trim(coalesce(_last_name, '')), ''),
      birth_day = _birth_day, birth_month = _birth_month
  WHERE id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_my_marketing_consent(_granted BOOLEAN, _consent_version TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := public.current_client_id();
  v_email TEXT;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_loyalty_card' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketing_consent_texts WHERE version = _consent_version) THEN
    RAISE EXCEPTION 'unknown_consent_version' USING ERRCODE = '22023';
  END IF;
  IF public.client_marketing_opt_in(v_id) = _granted THEN RETURN; END IF;
  SELECT email INTO v_email FROM public.clients WHERE id = v_id;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  VALUES (v_id, _granted, v_email, _consent_version, 'customer_panel', auth.uid());
END; $$;

-- Baja sin iniciar sesión (link para futuros emails de campaña)
CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
  v_version TEXT;
BEGIN
  SELECT id, email INTO v_id, v_email FROM public.clients WHERE unsubscribe_token = _token;
  IF v_id IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.client_marketing_opt_in(v_id) THEN RETURN TRUE; END IF;
  SELECT text_version INTO v_version FROM public.marketing_consents
  WHERE client_id = v_id ORDER BY created_at DESC, id DESC LIMIT 1;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source)
  VALUES (v_id, false, v_email, v_version, 'unsubscribe_link');
  RETURN TRUE;
END; $$;

-- Historial de servicios realizados (turnos atendidos + walk-ins/manuales acreditados)
CREATE OR REPLACE FUNCTION public.get_my_service_history()
RETURNS TABLE (visit_date DATE, service_name TEXT, barber_name TEXT, counted BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.appointment_date, a.service_name, b.name,
         EXISTS (SELECT 1 FROM public.loyalty_visits v WHERE v.appointment_id = a.id AND v.reversed_at IS NULL)
  FROM public.appointments a
  LEFT JOIN public.barbers b ON b.id = a.barber_id
  WHERE a.client_id = public.current_client_id() AND a.status = 'atendido'
  UNION ALL
  SELECT v.visit_date, COALESCE(v.service_name, 'Visita'), b.name, true
  FROM public.loyalty_visits v
  LEFT JOIN public.barbers b ON b.id = v.barber_id
  WHERE v.client_id = public.current_client_id() AND v.appointment_id IS NULL AND v.reversed_at IS NULL
  ORDER BY 1 DESC
  LIMIT 100
$$;

-- ---------------------------------------------------------------------
-- 9. API DEL PERSONAL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_create_client(
  _first_name TEXT, _last_name TEXT DEFAULT NULL, _phone TEXT DEFAULT NULL, _email TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(_phone), '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.clients WHERE phone = trim(_phone);
    IF v_id IS NOT NULL THEN RAISE EXCEPTION 'phone_exists' USING ERRCODE = '23505', DETAIL = v_id::text; END IF;
  END IF;
  INSERT INTO public.clients (first_name, last_name, phone, email, source)
  VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), NULLIF(trim(_phone), ''), _email, 'staff')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Walk-in: registra cobro + visita en una sola transacción.
-- _payment_id lo genera el frontend: reintentar con el mismo id no duplica.
CREATE OR REPLACE FUNCTION public.staff_register_walk_in(
  _payment_id UUID, _client_id UUID, _barber_id UUID, _service_name TEXT,
  _amount NUMERIC, _tip NUMERIC, _method public.payment_method, _payment_date DATE, _notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_client public.clients;
  v_existing UUID;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin')
          OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id AND b.user_id = v_uid)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_client FROM public.clients WHERE id = _client_id;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0002'; END IF;
  IF length(trim(coalesce(_service_name, ''))) = 0 OR _amount IS NULL OR _amount < 0 OR coalesce(_tip, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_payment' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing FROM public.payments WHERE id = _payment_id;
  IF v_existing IS NULL THEN
    INSERT INTO public.payments (id, barber_id, service_name, client_name, amount, tip, payment_method,
                                 payment_date, notes, created_by)
    VALUES (_payment_id, _barber_id, trim(_service_name),
            trim(v_client.first_name || ' ' || coalesce(v_client.last_name, '')),
            _amount, coalesce(_tip, 0), _method, coalesce(_payment_date, CURRENT_DATE),
            NULLIF(trim(coalesce(_notes, '')), ''), v_uid)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  PERFORM public._loyalty_credit(_client_id, 'walk_in', NULL, _payment_id, trim(_service_name),
                                 _barber_id, coalesce(_payment_date, CURRENT_DATE), NULL, v_uid);
  RETURN _payment_id;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_reward(_reward_id UUID, _note TEXT DEFAULT NULL, _appointment_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reward public.loyalty_rewards;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = _reward_id FOR UPDATE;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'reward_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_reward.status <> 'available' THEN
    RAISE EXCEPTION 'reward_not_available' USING ERRCODE = '55000', DETAIL = v_reward.status;
  END IF;
  UPDATE public.loyalty_rewards
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid(),
      redeemed_appointment_id = _appointment_id, redemption_note = NULLIF(trim(coalesce(_note, '')), '')
  WHERE id = _reward_id;
  INSERT INTO public.loyalty_events (client_id, event_type, reward_id, actor_id, reason)
  VALUES (v_reward.client_id, 'reward_redeemed', _reward_id, auth.uid(), NULLIF(trim(coalesce(_note, '')), ''));
END; $$;

-- Correcciones (solo admin, motivo obligatorio)
CREATE OR REPLACE FUNCTION public.admin_add_manual_visit(_client_id UUID, _visit_date DATE, _reason TEXT, _service_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id) THEN
    RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public._loyalty_credit(_client_id, 'manual', NULL, NULL, NULLIF(trim(coalesce(_service_name, '')), ''),
                                NULL, coalesce(_visit_date, CURRENT_DATE), trim(_reason), auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reverse_visit(_visit_id UUID, _reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN public._loyalty_reverse(_visit_id, _reason, auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_loyalty_program(_visits_required INT, _reward_description TEXT, _name TEXT DEFAULT 'Programa MVP Barber')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.loyalty_programs;
  v_new UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_old FROM public.loyalty_programs WHERE active FOR UPDATE;
  UPDATE public.loyalty_programs SET active = false, deactivated_at = now() WHERE active;
  INSERT INTO public.loyalty_programs (name, visits_required, reward_description, is_demo, created_by)
  VALUES (trim(_name), _visits_required, trim(_reward_description), false, auth.uid())
  RETURNING id INTO v_new;
  INSERT INTO public.loyalty_events (event_type, actor_id, details)
  VALUES ('program_changed', auth.uid(), jsonb_build_object(
    'old_program_id', v_old.id, 'old_visits_required', v_old.visits_required, 'old_reward', v_old.reward_description,
    'new_program_id', v_new, 'new_visits_required', _visits_required, 'new_reward', trim(_reward_description)));
  RETURN v_new;
END; $$;

-- Vincular una reserva anterior a un cliente (no suma visitas automáticamente)
CREATE OR REPLACE FUNCTION public.admin_link_appointment(_appointment_id UUID, _client_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  SELECT client_id INTO v_old FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.appointments SET client_id = _client_id WHERE id = _appointment_id;
  INSERT INTO public.loyalty_events (client_id, event_type, actor_id, reason, details)
  VALUES (_client_id, 'appointment_linked', auth.uid(), trim(_reason),
          jsonb_build_object('appointment_id', _appointment_id, 'previous_client_id', v_old));
END; $$;

-- Unir duplicados: mueve todo de _source a _target y borra _source.
-- No une dos cuentas verificadas distintas.
CREATE OR REPLACE FUNCTION public.admin_merge_clients(_source_id UUID, _target_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.clients;
  v_tgt public.clients;
  v_src_acc public.loyalty_accounts;
  v_prog public.loyalty_programs;
  v_cycle INT;
  v_reward UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  IF _source_id = _target_id THEN RAISE EXCEPTION 'same_client' USING ERRCODE = '22023'; END IF;

  -- Bloqueo en orden de id para evitar deadlocks entre merges cruzados
  PERFORM 1 FROM public.clients WHERE id IN (_source_id, _target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_src FROM public.clients WHERE id = _source_id;
  SELECT * INTO v_tgt FROM public.clients WHERE id = _target_id;
  IF v_src.id IS NULL OR v_tgt.id IS NULL THEN RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_src.user_id IS NOT NULL AND v_tgt.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'both_verified' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.loyalty_accounts (client_id) VALUES (_target_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.loyalty_accounts WHERE client_id IN (_source_id, _target_id) ORDER BY client_id FOR UPDATE;
  SELECT * INTO v_src_acc FROM public.loyalty_accounts WHERE client_id = _source_id;

  UPDATE public.appointments SET client_id = _target_id WHERE client_id = _source_id;
  UPDATE public.loyalty_visits SET client_id = _target_id WHERE client_id = _source_id;
  UPDATE public.loyalty_rewards SET client_id = _target_id WHERE client_id = _source_id;
  UPDATE public.marketing_consents SET client_id = _target_id WHERE client_id = _source_id;
  UPDATE public.loyalty_events SET client_id = _target_id WHERE client_id = _source_id;

  -- Liberar los valores únicos del origen y completar los faltantes del destino
  UPDATE public.clients SET user_id = NULL, phone = NULL WHERE id = _source_id;
  UPDATE public.clients SET
    user_id = COALESCE(v_tgt.user_id, v_src.user_id),
    email = CASE WHEN v_tgt.user_id IS NULL AND v_src.user_id IS NOT NULL THEN v_src.email ELSE COALESCE(v_tgt.email, v_src.email) END,
    phone = COALESCE(v_tgt.phone, v_src.phone),
    last_name = COALESCE(v_tgt.last_name, v_src.last_name),
    birth_date = COALESCE(v_tgt.birth_date, v_src.birth_date),
    birth_day = COALESCE(v_tgt.birth_day, v_src.birth_day),
    birth_month = COALESCE(v_tgt.birth_month, v_src.birth_month)
  WHERE id = _target_id;

  -- Sumar progreso y emitir premios que correspondan
  SELECT * INTO v_prog FROM public.loyalty_programs WHERE active;
  SELECT cycle_visits + COALESCE(v_src_acc.cycle_visits, 0) INTO v_cycle FROM public.loyalty_accounts WHERE client_id = _target_id;
  IF v_prog.id IS NOT NULL THEN
    WHILE v_cycle >= v_prog.visits_required LOOP
      INSERT INTO public.loyalty_rewards (client_id, program_id, visits_required, reward_description, is_demo)
      VALUES (_target_id, v_prog.id, v_prog.visits_required, v_prog.reward_description, v_prog.is_demo)
      RETURNING id INTO v_reward;
      INSERT INTO public.loyalty_events (client_id, event_type, reward_id, actor_id, reason)
      VALUES (_target_id, 'reward_earned', v_reward, auth.uid(), 'Unión de fichas');
      v_cycle := v_cycle - v_prog.visits_required;
    END LOOP;
  END IF;
  UPDATE public.loyalty_accounts
  SET total_visits = total_visits + COALESCE(v_src_acc.total_visits, 0), cycle_visits = v_cycle, updated_at = now()
  WHERE client_id = _target_id;

  INSERT INTO public.loyalty_events (client_id, event_type, actor_id, reason, details)
  VALUES (_target_id, 'clients_merged', auth.uid(), trim(_reason), jsonb_build_object(
    'source_client_id', _source_id,
    'source_name', trim(v_src.first_name || ' ' || coalesce(v_src.last_name, '')),
    'source_phone', v_src.phone, 'source_email', v_src.email));

  DELETE FROM public.clients WHERE id = _source_id;
END; $$;

-- Baja registrada por el personal (ej. el cliente lo pidió en persona).
-- El personal NO puede dar de alta un consentimiento en nombre del cliente.
CREATE OR REPLACE FUNCTION public.staff_record_unsubscribe(_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_version TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.client_marketing_opt_in(_client_id) THEN RETURN; END IF;
  SELECT email INTO v_email FROM public.clients WHERE id = _client_id;
  SELECT text_version INTO v_version FROM public.marketing_consents
  WHERE client_id = _client_id ORDER BY created_at DESC, id DESC LIMIT 1;
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  VALUES (_client_id, false, v_email, v_version, 'staff', auth.uid());
END; $$;

-- Exportación para campañas: solo consentimiento vigente y email verificado
CREATE OR REPLACE FUNCTION public.admin_export_marketing_contacts()
RETURNS TABLE (
  first_name TEXT, last_name TEXT, email TEXT, birthday TEXT,
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
    ORDER BY mc.client_id, mc.created_at DESC, mc.id DESC
  )
  SELECT c.first_name, c.last_name, c.email,
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
-- 10. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public._loyalty_credit(UUID, TEXT, UUID, UUID, TEXT, UUID, DATE, TEXT, UUID),
  public._loyalty_reverse(UUID, TEXT, UUID),
  public.loyalty_on_appointment_status(),
  public.normalize_client_email()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.loyalty_register(TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT),
  public.update_my_profile(TEXT, TEXT, SMALLINT, SMALLINT),
  public.set_my_marketing_consent(BOOLEAN, TEXT),
  public.get_my_service_history(),
  public.staff_create_client(TEXT, TEXT, TEXT, TEXT),
  public.staff_register_walk_in(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, public.payment_method, DATE, TEXT),
  public.redeem_reward(UUID, TEXT, UUID),
  public.admin_add_manual_visit(UUID, DATE, TEXT, TEXT),
  public.admin_reverse_visit(UUID, TEXT),
  public.admin_update_loyalty_program(INT, TEXT, TEXT),
  public.admin_link_appointment(UUID, UUID, TEXT),
  public.admin_merge_clients(UUID, UUID, TEXT),
  public.staff_record_unsubscribe(UUID),
  public.admin_export_marketing_contacts(),
  public.is_staff(UUID),
  public.current_client_id(),
  public.client_marketing_opt_in(UUID),
  public.unsubscribe_by_token(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.loyalty_register(TEXT, TEXT, SMALLINT, SMALLINT, BOOLEAN, TEXT),
  public.update_my_profile(TEXT, TEXT, SMALLINT, SMALLINT),
  public.set_my_marketing_consent(BOOLEAN, TEXT),
  public.get_my_service_history(),
  public.staff_create_client(TEXT, TEXT, TEXT, TEXT),
  public.staff_register_walk_in(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, public.payment_method, DATE, TEXT),
  public.redeem_reward(UUID, TEXT, UUID),
  public.admin_add_manual_visit(UUID, DATE, TEXT, TEXT),
  public.admin_reverse_visit(UUID, TEXT),
  public.admin_update_loyalty_program(INT, TEXT, TEXT),
  public.admin_link_appointment(UUID, UUID, TEXT),
  public.admin_merge_clients(UUID, UUID, TEXT),
  public.staff_record_unsubscribe(UUID),
  public.admin_export_marketing_contacts(),
  public.is_staff(UUID),
  public.current_client_id()
TO authenticated;

REVOKE EXECUTE ON FUNCTION public.client_marketing_opt_in(UUID) FROM authenticated;

-- Las políticas RLS las evalúan también para anon (devuelven false / NULL)
GRANT EXECUTE ON FUNCTION public.is_staff(UUID), public.current_client_id() TO anon;

GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(UUID) TO anon, authenticated;
