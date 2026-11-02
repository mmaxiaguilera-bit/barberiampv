-- =====================================================================
-- FIDELIDAD: la tarjeta empieza a contar el martes 3/11/2026 (loyalty_settings.starts_on)
-- =====================================================================
-- * Turnos atendidos y atenciones sin turno con fecha anterior no suman
--   (aparecen en el historial como "anterior a la tarjeta").
-- * El admin tampoco puede sumar visitas manuales con fecha anterior.

-- Una sola fila. Se cambia solo por SQL (la base de pruebas la adelanta para sus datos demo).
CREATE TABLE public.loyalty_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  starts_on DATE NOT NULL
);
INSERT INTO public.loyalty_settings (starts_on) VALUES (DATE '2026-11-03');
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view loyalty settings" ON public.loyalty_settings FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.loyalty_start_date()
RETURNS DATE LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT starts_on FROM public.loyalty_settings
$$;
GRANT EXECUTE ON FUNCTION public.loyalty_start_date() TO anon, authenticated;

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
