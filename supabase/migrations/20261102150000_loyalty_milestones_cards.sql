-- =====================================================================
-- FIDELIDAD: premios en el camino y alta de tarjetas desde el local
-- =====================================================================
-- * loyalty_programs.milestones: lista [{visits, reward}] de premios antes del final
--   (ej. 3ª visita → 10% off, 6ª → 20% off). El cliente ve un regalo sorpresa en
--   ese círculo; el premio aparece en su lista al llegar. Se anula al revertir.
-- * admin_create_card(): el personal pasa a la web las tarjetas físicas, para un
--   cliente existente o uno nuevo, con los sellos que ya tenía.

ALTER TABLE public.loyalty_programs DROP CONSTRAINT IF EXISTS loyalty_programs_mid_check;
ALTER TABLE public.loyalty_programs DROP COLUMN IF EXISTS mid_visits;
ALTER TABLE public.loyalty_programs DROP COLUMN IF EXISTS mid_reward_description;
ALTER TABLE public.loyalty_programs ADD COLUMN IF NOT EXISTS milestones JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.loyalty_events DROP CONSTRAINT IF EXISTS loyalty_events_event_type_check;
ALTER TABLE public.loyalty_events ADD CONSTRAINT loyalty_events_event_type_check CHECK (event_type IN (
  'client_registered', 'visit_credited', 'visit_reversed', 'reward_earned',
  'reward_redeemed', 'reward_voided', 'program_changed', 'clients_merged',
  'appointment_linked', 'consent_changed', 'settings_changed', 'card_imported'
));

DROP FUNCTION IF EXISTS public.admin_update_loyalty_program(INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_loyalty_program(INT, TEXT, TEXT, INT, TEXT);
CREATE FUNCTION public.admin_update_loyalty_program(
  _visits_required INT, _reward_description TEXT, _name TEXT DEFAULT 'Programa MVP Barber',
  _milestones JSONB DEFAULT '[]'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.loyalty_programs;
  v_new UUID;
  v_ms JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _visits_required IS NULL OR _visits_required NOT BETWEEN 1 AND 100
     OR length(trim(coalesce(_reward_description, ''))) < 3 THEN
    RAISE EXCEPTION 'invalid_program' USING ERRCODE = '22023';
  END IF;
  _milestones := coalesce(_milestones, '[]'::jsonb);
  IF jsonb_typeof(_milestones) <> 'array' OR jsonb_array_length(_milestones) > 20 THEN
    RAISE EXCEPTION 'invalid_milestones' USING ERRCODE = '22023';
  END IF;
  -- Cada premio: visita entre 1 y la anterior al final, sin repetir, con descripción
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_milestones) e
    WHERE jsonb_typeof(e->'visits') <> 'number'
       OR (e->>'visits')::numeric <> floor((e->>'visits')::numeric)
       OR (e->>'visits')::int NOT BETWEEN 1 AND _visits_required - 1
       OR length(trim(coalesce(e->>'reward', ''))) < 3
  ) OR (SELECT count(DISTINCT (e->>'visits')::int) FROM jsonb_array_elements(_milestones) e) <> jsonb_array_length(_milestones) THEN
    RAISE EXCEPTION 'invalid_milestones' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('visits', (e->>'visits')::int, 'reward', trim(e->>'reward'))
                            ORDER BY (e->>'visits')::int), '[]'::jsonb)
  INTO v_ms FROM jsonb_array_elements(_milestones) e;

  SELECT * INTO v_old FROM public.loyalty_programs WHERE active FOR UPDATE;
  UPDATE public.loyalty_programs SET active = false, deactivated_at = now() WHERE active;
  INSERT INTO public.loyalty_programs (name, visits_required, reward_description, is_demo, created_by, milestones)
  VALUES (trim(_name), _visits_required, trim(_reward_description), false, auth.uid(), v_ms)
  RETURNING id INTO v_new;
  INSERT INTO public.loyalty_events (event_type, actor_id, details)
  VALUES ('program_changed', auth.uid(), jsonb_build_object(
    'old_program_id', v_old.id, 'old_visits_required', v_old.visits_required, 'old_reward', v_old.reward_description,
    'old_milestones', v_old.milestones,
    'new_program_id', v_new, 'new_visits_required', _visits_required, 'new_reward', trim(_reward_description),
    'new_milestones', v_ms));
  RETURN v_new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_update_loyalty_program(INT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_loyalty_program(INT, TEXT, TEXT, JSONB) TO authenticated;

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
  -- Tarjeta pausada desde Admin: no suma nada (la carga manual avisa)
  IF NOT coalesce((SELECT enabled FROM public.loyalty_settings), true) THEN
    IF _source = 'manual' THEN RAISE EXCEPTION 'loyalty_paused' USING ERRCODE = '22023'; END IF;
    RETURN NULL;
  END IF;

  -- Antes del lanzamiento no suma: turnos y atenciones se ignoran, la carga manual se rechaza
  IF _visit_date < public.loyalty_start_date() THEN
    IF _source = 'manual' THEN RAISE EXCEPTION 'before_loyalty_start' USING ERRCODE = '22023'; END IF;
    RETURN NULL;
  END IF;

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
  -- Premios en el camino: al llegar justo a esa visita del ciclo
  IF v_prog.id IS NOT NULL THEN
    INSERT INTO public.loyalty_rewards (client_id, program_id, visits_required, reward_description, is_demo, earned_visit_id)
    SELECT _client_id, v_prog.id, (e->>'visits')::int, e->>'reward', false, v_visit_id
    FROM jsonb_array_elements(v_prog.milestones) e
    WHERE (e->>'visits')::int = v_cycle
    RETURNING id INTO v_reward_id;
    IF v_reward_id IS NOT NULL THEN
      INSERT INTO public.loyalty_events (client_id, event_type, visit_id, reward_id, actor_id, details)
      VALUES (_client_id, 'reward_earned', v_visit_id, v_reward_id, _actor, '{"kind":"milestone"}'::jsonb);
    END IF;
  END IF;
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
REVOKE EXECUTE ON FUNCTION public._loyalty_credit(UUID, TEXT, UUID, UUID, TEXT, UUID, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;

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
    -- Si esa visita había dado un premio en el camino y no se usó, se anula
    FOR v_reward IN SELECT * FROM public.loyalty_rewards
      WHERE earned_visit_id = _visit_id AND status = 'available' FOR UPDATE LOOP
      UPDATE public.loyalty_rewards
      SET status = 'voided', voided_at = now(), voided_by = _actor,
          void_reason = 'Anulado al revertir una visita: ' || trim(_reason)
      WHERE id = v_reward.id;
      INSERT INTO public.loyalty_events (client_id, event_type, visit_id, reward_id, actor_id, reason)
      VALUES (v_client, 'reward_voided', _visit_id, v_reward.id, _actor, trim(_reason));
    END LOOP;
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

REVOKE EXECUTE ON FUNCTION public._loyalty_reverse(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Alta de tarjeta desde el local (pasar las tarjetas físicas a la web)
--   * _client_id: cliente existente; si es NULL se crea uno con los datos.
--   * _initial_visits: sellos que ya tenía en la tarjeta física (0 a visitas-1).
--   * El cliente puede entrar después a /mi-tarjeta con el mismo email.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_card(
  _client_id UUID, _first_name TEXT DEFAULT NULL, _last_name TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL, _email TEXT DEFAULT NULL, _whatsapp TEXT DEFAULT NULL,
  _birth_day SMALLINT DEFAULT NULL, _birth_month SMALLINT DEFAULT NULL, _birth_year SMALLINT DEFAULT NULL,
  _initial_visits INT DEFAULT 0, _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID := _client_id;
  v_prog public.loyalty_programs;
  v_email TEXT := NULLIF(lower(trim(coalesce(_email, ''))), '');
  v_phone TEXT := NULLIF(trim(coalesce(_phone, '')), '');
  v_wa TEXT := NULLIF(public.normalize_whatsapp(_whatsapp), '');
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_prog FROM public.loyalty_programs WHERE active;
  IF _initial_visits IS NULL OR _initial_visits < 0 OR _initial_visits >= coalesce(v_prog.visits_required, 100) THEN
    RAISE EXCEPTION 'invalid_initial_visits' USING ERRCODE = '22023';
  END IF;
  IF (_birth_day IS NULL) <> (_birth_month IS NULL)
     OR (_birth_year IS NOT NULL AND NOT public.valid_birth_date(_birth_day, _birth_month, _birth_year)) THEN
    RAISE EXCEPTION 'invalid_birthday' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NOT NULL AND v_wa !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'invalid_whatsapp' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF length(trim(coalesce(_first_name, ''))) NOT BETWEEN 2 AND 50 THEN
      RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
    END IF;
    IF v_phone IS NULL AND v_email IS NULL THEN
      RAISE EXCEPTION 'contact_required' USING ERRCODE = '22023';
    END IF;
    IF v_phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients WHERE phone = v_phone) THEN
      RAISE EXCEPTION 'phone_exists' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.clients (first_name, last_name, phone, email, whatsapp, birth_day, birth_month, birth_year, source)
    VALUES (trim(_first_name), NULLIF(trim(coalesce(_last_name, '')), ''), v_phone, v_email, v_wa,
            _birth_day, _birth_month, _birth_year, 'staff')
    RETURNING id INTO v_id;
  ELSE
    PERFORM 1 FROM public.clients WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0002'; END IF;
    -- Completa solo los datos que falten en la ficha
    UPDATE public.clients
    SET email = coalesce(email, v_email),
        whatsapp = coalesce(whatsapp, v_wa),
        birth_day = CASE WHEN birth_day IS NULL THEN _birth_day ELSE birth_day END,
        birth_month = CASE WHEN birth_day IS NULL THEN _birth_month ELSE birth_month END,
        birth_year = coalesce(birth_year, _birth_year)
    WHERE id = v_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.loyalty_accounts WHERE client_id = v_id) THEN
    RAISE EXCEPTION 'card_exists' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.loyalty_accounts (client_id, total_visits, cycle_visits)
  VALUES (v_id, _initial_visits, _initial_visits);
  INSERT INTO public.loyalty_events (client_id, event_type, actor_id, reason, details)
  VALUES (v_id, 'card_imported', auth.uid(), NULLIF(trim(coalesce(_note, '')), ''),
          jsonb_build_object('initial_visits', _initial_visits, 'new_client', _client_id IS NULL));
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_create_card(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT, SMALLINT, SMALLINT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_card(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT, SMALLINT, SMALLINT, INT, TEXT) TO authenticated;
