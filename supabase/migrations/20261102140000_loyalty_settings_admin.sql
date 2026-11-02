-- =====================================================================
-- FIDELIDAD: configuración desde Admin → Tarjeta
-- =====================================================================
-- * loyalty_settings suma: enabled (pausar/encender), premio de cumpleaños y auditoría.
-- * admin_update_loyalty_settings(): solo admin; registra el cambio en loyalty_events.
-- * Pausada: no suma visitas (_loyalty_credit) ni permite crear tarjetas nuevas.

ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS birthday_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_reward TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE public.loyalty_events DROP CONSTRAINT IF EXISTS loyalty_events_event_type_check;
ALTER TABLE public.loyalty_events ADD CONSTRAINT loyalty_events_event_type_check CHECK (event_type IN (
  'client_registered', 'visit_credited', 'visit_reversed', 'reward_earned',
  'reward_redeemed', 'reward_voided', 'program_changed', 'clients_merged',
  'appointment_linked', 'consent_changed', 'settings_changed'
));

CREATE OR REPLACE FUNCTION public.admin_update_loyalty_settings(
  _enabled BOOLEAN, _starts_on DATE, _birthday_enabled BOOLEAN, _birthday_reward TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.loyalty_settings;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _enabled IS NULL OR _starts_on IS NULL OR _birthday_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_settings' USING ERRCODE = '22023';
  END IF;
  IF _birthday_enabled AND length(trim(coalesce(_birthday_reward, ''))) < 3 THEN
    RAISE EXCEPTION 'birthday_reward_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.loyalty_settings FOR UPDATE;
  UPDATE public.loyalty_settings
  SET enabled = _enabled, starts_on = _starts_on,
      birthday_enabled = _birthday_enabled,
      birthday_reward = NULLIF(trim(coalesce(_birthday_reward, '')), ''),
      updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.loyalty_events (event_type, actor_id, details)
  VALUES ('settings_changed', auth.uid(), jsonb_build_object(
    'old', jsonb_build_object('enabled', v_old.enabled, 'starts_on', v_old.starts_on,
                              'birthday_enabled', v_old.birthday_enabled, 'birthday_reward', v_old.birthday_reward),
    'new', jsonb_build_object('enabled', _enabled, 'starts_on', _starts_on,
                              'birthday_enabled', _birthday_enabled, 'birthday_reward', NULLIF(trim(coalesce(_birthday_reward, '')), ''))));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_update_loyalty_settings(BOOLEAN, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_loyalty_settings(BOOLEAN, DATE, BOOLEAN, TEXT) TO authenticated;

-- Pausada: no se crean tarjetas nuevas
CREATE OR REPLACE FUNCTION public.block_signup_when_paused()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce((SELECT enabled FROM public.loyalty_settings), true) THEN
    RAISE EXCEPTION 'loyalty_paused' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS loyalty_accounts_block_paused ON public.loyalty_accounts;
CREATE TRIGGER loyalty_accounts_block_paused
BEFORE INSERT ON public.loyalty_accounts
FOR EACH ROW EXECUTE FUNCTION public.block_signup_when_paused();

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
