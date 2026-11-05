-- =====================================================================
-- Tests de seguridad (auditoría 2026-11-05). Requiere supabase/dev/seed.sql.
-- Corre en una transacción que termina en ROLLBACK. Uso: npm run db:test:security:dev
-- =====================================================================
BEGIN;

CREATE TEMP TABLE results (n SERIAL, name TEXT, ok BOOLEAN, detail TEXT);
GRANT ALL ON results TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE results_n_seq TO authenticated, anon;

CREATE FUNCTION pg_temp.act(_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF _uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
END $$;

CREATE FUNCTION pg_temp.ok(_name TEXT, _cond BOOLEAN, _detail TEXT DEFAULT NULL) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO results (name, ok, detail) VALUES (_name, coalesce(_cond, false), _detail)
$$;

CREATE FUNCTION pg_temp.err(_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END $$;

-- Próximo día hábil (lunes a sábado) a 7 días o más, sin bloqueos de Pedro
CREATE TEMP TABLE ctx AS SELECT
  '00000000-0000-4000-a000-000000000001'::uuid AS admin,
  '00000000-0000-4000-a000-000000000002'::uuid AS barber,      -- usuario de Juan
  '00000000-0000-4000-a000-000000000003'::uuid AS sofia_user,
  '00000000-0000-4000-b000-000000000001'::uuid AS juan,
  '00000000-0000-4000-b000-000000000002'::uuid AS pedro,
  '00000000-0000-4000-d000-000000000001'::uuid AS sofia,
  (SELECT id FROM public.services ORDER BY display_order LIMIT 1) AS svc,
  (SELECT d::date FROM generate_series(CURRENT_DATE + 7, CURRENT_DATE + 20, INTERVAL '1 day') d
     WHERE extract(dow FROM d) BETWEEN 1 AND 6
       AND NOT EXISTS (SELECT 1 FROM public.barber_blocks b WHERE b.block_date = d::date)
       AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.appointment_date = d::date)
     ORDER BY d LIMIT 1) AS day;
GRANT SELECT ON ctx TO authenticated, anon;

CREATE FUNCTION pg_temp.book(_time TEXT, _phone TEXT, _email TEXT DEFAULT NULL, _barber UUID DEFAULT NULL,
                             _date DATE DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE c ctx;
BEGIN
  SELECT * INTO c FROM ctx;
  RETURN pg_temp.err(format(
    $q$SELECT create_booking(%L, %L, %L, %L, 'Ana', 'Prueba', %L, %L, 'terminos-v2-2026-10', 'privacidad-v3-2026-11')$q$,
    c.svc, coalesce(_barber, c.pedro), coalesce(_date, c.day), _time, _phone, coalesce(_email, 'ana@mvp.test')));
END $$;

DO $$
DECLARE c ctx; e TEXT; n INT; tok UUID; tok2 UUID; v_price NUMERIC; v_dur INT; v_cid UUID; a UUID; near TIMESTAMP;
BEGIN
  RESET role;
  SELECT * INTO c FROM ctx;
  PERFORM pg_temp.ok('hay un día de prueba libre', c.day IS NOT NULL, c.day::text);

  -- ---------------- A3: reserva directa bloqueada ----------------
  PERFORM pg_temp.act(NULL);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, service_price,
    service_duration_minutes, barber_id, appointment_date, appointment_time, status, terms_version, privacy_notice_version)
    VALUES ('Spam', '2971111111', %L, 'Corte', 0, 600, %L, %L, '10:00', 'pendiente', 'terminos-v2-2026-10', 'privacidad-v2-2026-10')$q$,
    c.svc, c.pedro, c.day));
  PERFORM pg_temp.ok('A3 anon no inserta turnos directo (precio 0 / 600 min)', e IS NOT NULL, e);

  -- Reserva válida por RPC: precio y duración salen del servicio
  e := pg_temp.book('10:00', '2971111111', 'ana@mvp.test');
  PERFORM pg_temp.ok('A3 reserva válida por create_booking', e IS NULL, e);
  RESET role;
  SELECT service_price, service_duration_minutes, cancel_token, client_id INTO v_price, v_dur, tok, v_cid
    FROM appointments WHERE client_phone = '2971111111' AND appointment_date = c.day;
  PERFORM pg_temp.ok('A3 precio y duración los pone el servidor',
    v_price = (SELECT price FROM services WHERE id = c.svc) AND v_dur = (SELECT duration_minutes FROM services WHERE id = c.svc),
    v_price || ' / ' || v_dur);

  PERFORM pg_temp.act(NULL);
  e := pg_temp.book('10:00', '2971111112');
  PERFORM pg_temp.ok('A3 mismo horario ocupado se rechaza', e LIKE '%slot_taken%' OR e LIKE '%duplicate%', e);
  e := pg_temp.book('10:15', '2971111112');
  PERFORM pg_temp.ok('A3 horario solapado se rechaza', e LIKE '%slot_taken%', e);
  e := pg_temp.book('03:00', '2971111112');
  PERFORM pg_temp.ok('A3 fuera del horario del barbero se rechaza', e LIKE '%outside_schedule%', e);
  e := pg_temp.book('10:00', '2971111112', NULL, NULL, CURRENT_DATE - 1);
  PERFORM pg_temp.ok('A3 fecha pasada se rechaza', e LIKE '%invalid_datetime%', e);
  e := pg_temp.book('10:00', '2971111112', NULL, NULL, CURRENT_DATE + 400);
  PERFORM pg_temp.ok('A3 más de 6 meses se rechaza', e LIKE '%invalid_datetime%', e);
  e := pg_temp.err(format($q$SELECT create_booking(%L, %L, %L, '12:00', 'Ana', 'Prueba', '2971111112', NULL, 'terminos-v3-2026-11', 'privacidad-v4-2026-11')$q$,
    c.svc, c.pedro, c.day));
  PERFORM pg_temp.ok('reserva sin email se rechaza', e LIKE '%invalid_email%', e);
  e := pg_temp.err(format($q$SELECT create_booking(%L, %L, %L, '12:00', 'Ana', 'Prueba', '2971111112', 'ana@mvp.test', NULL, NULL)$q$,
    c.svc, c.pedro, c.day));
  PERFORM pg_temp.ok('A3 sin aceptar condiciones se rechaza', e LIKE '%terms_not_accepted%', e);
  e := pg_temp.err(format($q$SELECT create_booking(%L, %L, %L, '12:00', 'Ana', 'Prueba', '<script>', NULL, 'terminos-v2-2026-10', 'privacidad-v3-2026-11')$q$,
    c.svc, c.pedro, c.day));
  PERFORM pg_temp.ok('A3 teléfono inválido se rechaza', e LIKE '%invalid_phone%', e);

  -- Bloqueo de día completo
  RESET role;
  INSERT INTO barber_blocks (barber_id, block_date) VALUES (c.juan, c.day);
  PERFORM pg_temp.act(NULL);
  e := pg_temp.book('10:00', '2971111113', NULL, c.juan);
  PERFORM pg_temp.ok('A3 día bloqueado se rechaza', e LIKE '%slot_taken%', e);

  -- Máximo 3 turnos futuros por teléfono
  e := pg_temp.book('12:00', '2971111111');
  e := pg_temp.book('14:00', '2971111111');
  e := pg_temp.book('16:00', '2971111111');
  PERFORM pg_temp.ok('A3 cuarto turno del mismo teléfono se rechaza', e LIKE '%too_many_bookings%', e);

  -- ---------------- A2: fichas de cliente ----------------
  e := pg_temp.err($q$INSERT INTO clients (first_name, phone, email, user_id) VALUES ('Intruso', '2970000001', 'atacante@x.test', NULL)$q$);
  PERFORM pg_temp.ok('A2 anon no inserta fichas directo', e IS NOT NULL, e);

  -- Teléfono de Sofía (tarjeta verificada) con otro email: el turno NO se cuelga de su ficha
  e := pg_temp.book('18:00', '2970000001', 'atacante@x.test');
  PERFORM pg_temp.ok('A2 reserva con teléfono ajeno funciona', e IS NULL, e);
  RESET role;
  SELECT client_id INTO v_cid FROM appointments WHERE client_phone = '2970000001' AND appointment_date = c.day;
  PERFORM pg_temp.ok('A2 teléfono de una tarjeta verificada con otro email no se vincula', v_cid IS NULL, coalesce(v_cid::text, 'null'));

  -- Con el email verificado de Sofía sí se vincula
  PERFORM pg_temp.act(NULL);
  e := pg_temp.book('19:00', '2970000001', 'sofia@mvp.test');
  RESET role;
  SELECT client_id INTO v_cid FROM appointments WHERE client_phone = '2970000001' AND appointment_date = c.day AND appointment_time = '19:00';
  PERFORM pg_temp.ok('A2 con el email verificado se vincula a su ficha', v_cid = c.sofia, coalesce(v_cid::text, 'null') || ' ' || coalesce(e, ''));

  -- ---------------- A1: ver y cancelar exige token ----------------
  PERFORM pg_temp.act(NULL);
  e := pg_temp.err($q$SELECT get_my_appointments('2971111111')$q$);
  PERFORM pg_temp.ok('A1 ya no se listan turnos por teléfono', e IS NOT NULL, e);
  e := pg_temp.err(format($q$SELECT cancel_my_appointment('2971111111', %L)$q$, gen_random_uuid()));
  PERFORM pg_temp.ok('A1 ya no se cancela por teléfono', e IS NOT NULL, e);
  SELECT count(*) INTO n FROM get_appointments_by_tokens(ARRAY[tok]);
  PERFORM pg_temp.ok('A1 con el token se ve el turno', n = 1, n::text);
  SELECT count(*) INTO n FROM get_appointments_by_tokens(ARRAY[gen_random_uuid()]);
  PERFORM pg_temp.ok('A1 un token inventado no devuelve nada', n = 0, n::text);
  PERFORM pg_temp.ok('A1 token inventado no cancela', NOT cancel_appointment_by_token(gen_random_uuid()));
  PERFORM pg_temp.ok('A1 con el token se cancela (más de 3 h)', cancel_appointment_by_token(tok));
  PERFORM pg_temp.ok('A1 no se cancela dos veces', NOT cancel_appointment_by_token(tok));

  RESET role;
  near := date_trunc('minute', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + INTERVAL '2 hours';
  INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id, appointment_date, appointment_time, status)
  VALUES ('Ana Cerca', '2971111119', c.svc, 'Corte', c.pedro, near::date, near::time, 'pendiente')
  RETURNING cancel_token INTO tok2;
  PERFORM pg_temp.act(NULL);
  PERFORM pg_temp.ok('A1 con menos de 3 h no se cancela online', NOT cancel_appointment_by_token(tok2));

  -- ---------------- B4 / B5 ----------------
  e := pg_temp.err($q$SELECT get_client_by_phone('2970000001')$q$);
  PERFORM pg_temp.ok('B4 ya no existe la búsqueda pública por teléfono', e IS NOT NULL, e);
  SELECT count(*) INTO n FROM barber_blocks;
  PERFORM pg_temp.ok('B5 anon no lee barber_blocks (motivos)', n = 0, n::text);
  SELECT count(*) INTO n FROM get_full_day_blocked_dates(c.juan, c.day, c.day);
  PERFORM pg_temp.ok('B5 el calendario público sigue viendo días bloqueados', n = 1, n::text);

  -- Pedidos de reenvío: solo los ve el servidor
  e := pg_temp.err($q$SELECT count(*) FROM booking_link_requests$q$);
  PERFORM pg_temp.ok('anon no lee los pedidos de reenvío', e IS NOT NULL, e);
  e := pg_temp.err($q$INSERT INTO booking_link_requests (email) VALUES ('x@x.test')$q$);
  PERFORM pg_temp.ok('anon no escribe pedidos de reenvío', e IS NOT NULL, e);
  RESET role;
  PERFORM pg_temp.ok('existen las versiones legales nuevas',
    (SELECT count(*) FROM legal_document_versions WHERE version IN ('terminos-v3-2026-11', 'privacidad-v4-2026-11')) = 2);
  PERFORM pg_temp.act(NULL);

  -- ---------------- B6 ----------------
  PERFORM pg_temp.ok('B6 anon no puede averiguar si alguien es admin', NOT has_role(c.admin, 'admin'));
  PERFORM pg_temp.act(c.barber);
  PERFORM pg_temp.ok('B6 un barbero no puede averiguar roles ajenos', NOT has_role(c.admin, 'admin'));
  PERFORM pg_temp.act(c.admin);
  PERFORM pg_temp.ok('B6 el admin sigue siendo admin', has_role(c.admin, 'admin'));

  -- ---------------- M1: barbero ----------------
  RESET role;
  INSERT INTO appointments (client_name, client_phone, service_id, service_name, service_price, barber_id,
                            appointment_date, appointment_time, status)
  VALUES ('Turno Juan', '2971111120', c.svc, 'Corte', 12000, c.juan, c.day + 1, '10:00', 'confirmado')
  RETURNING id INTO a;
  PERFORM pg_temp.act(c.barber);
  e := pg_temp.err(format($q$UPDATE appointments SET service_price = 1 WHERE id = %L$q$, a));
  PERFORM pg_temp.ok('M1 el barbero no cambia el precio', e LIKE '%barber_cannot_change_field%', e);
  e := pg_temp.err(format($q$UPDATE appointments SET client_id = %L WHERE id = %L$q$, c.sofia, a));
  PERFORM pg_temp.ok('M1 el barbero no cambia el cliente', e LIKE '%barber_cannot_change_field%', e);
  e := pg_temp.err(format($q$UPDATE appointments SET status = 'atendido', notes = 'ok' WHERE id = %L$q$, a));
  PERFORM pg_temp.ok('M1 el barbero sí marca atendido y deja notas', e IS NULL, e);
  PERFORM pg_temp.act(c.admin);
  e := pg_temp.err(format($q$UPDATE appointments SET service_price = 13000 WHERE id = %L$q$, a));
  PERFORM pg_temp.ok('M1 el admin sí cambia el precio', e IS NULL, e);

  -- ---------------- M2: finanzas ----------------
  RESET role;
  INSERT INTO expenses (amount, description, category) VALUES (1000, 'test sueldo', 'sueldos');
  PERFORM pg_temp.act(c.barber);
  SELECT count(*) INTO n FROM expenses;
  PERFORM pg_temp.ok('M2 el barbero no ve gastos', n = 0, n::text);
  SELECT count(*) INTO n FROM cash_closures;
  PERFORM pg_temp.ok('M2 el barbero no ve cierres de caja', n = 0, n::text);
  PERFORM pg_temp.act(c.admin);
  SELECT count(*) INTO n FROM expenses;
  PERFORM pg_temp.ok('M2 el admin sí ve gastos', n >= 1, n::text);

  -- ---------------- B3: admins ----------------
  PERFORM pg_temp.act(c.sofia_user);
  e := pg_temp.err($q$SELECT claim_first_admin()$q$);
  PERFORM pg_temp.ok('B3 claim_first_admin ya no existe', e IS NOT NULL, e);
  RESET role;
  e := pg_temp.err($q$DELETE FROM user_roles WHERE role = 'admin'$q$);
  PERFORM pg_temp.ok('B3 no se puede quitar el último admin', e LIKE '%last_admin%', e);

  -- ---------------- B7: profiles ----------------
  PERFORM pg_temp.act(c.sofia_user);
  e := pg_temp.err(format($q$UPDATE profiles SET email = 'otro@x.test' WHERE id = %L$q$, c.sofia_user));
  PERFORM pg_temp.ok('B7 el usuario no cambia su email en profiles', e IS NOT NULL, e);
  e := pg_temp.err(format($q$UPDATE profiles SET full_name = 'Sofía D.' WHERE id = %L$q$, c.sofia_user));
  PERFORM pg_temp.ok('B7 el usuario sí cambia su nombre', e IS NULL, e);

  -- ---------------- Staff sigue cargando turnos ----------------
  PERFORM pg_temp.act(c.admin);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status) VALUES ('Carga Admin', '2971111130', %L, 'Corte', %L, %L, '20:00', 'confirmado')$q$,
    c.svc, c.pedro, c.day));
  PERFORM pg_temp.ok('el admin sigue cargando turnos a mano', e IS NULL, e);
  PERFORM pg_temp.act(c.sofia_user);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status) VALUES ('Cliente directo', '2971111131', %L, 'Corte', %L, %L, '20:00', 'pendiente')$q$,
    c.svc, c.pedro, c.day + 2));
  PERFORM pg_temp.ok('un cliente con sesión no inserta turnos directo', e IS NOT NULL, e);
END $$;

RESET role;
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM results ORDER BY n;
ROLLBACK;
