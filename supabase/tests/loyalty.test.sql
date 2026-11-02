-- =====================================================================
-- Tests de fidelización (RLS, roles, acreditación, premios, consentimiento)
-- Requiere los datos de supabase/dev/seed.sql. Todo corre en una transacción
-- que termina en ROLLBACK: no deja cambios. Uso: npm run db:test:dev
-- =====================================================================
BEGIN;

-- Las pruebas usan fechas de hoy: la tarjeta cuenta desde siempre dentro de esta transacción
UPDATE public.loyalty_settings SET starts_on = DATE '2000-01-01';

CREATE TEMP TABLE results (n SERIAL, name TEXT, ok BOOLEAN, detail TEXT);
GRANT ALL ON results TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE results_n_seq TO authenticated, anon;

-- Impersonación: sub del JWT + rol de Postgres, como hace PostgREST
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

-- Espera que _sql falle; devuelve el mensaje de error (o NULL si no falló)
CREATE FUNCTION pg_temp.err(_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END $$;

-- IDs del seed
CREATE TEMP TABLE ids AS SELECT
  '00000000-0000-4000-a000-000000000001'::uuid AS admin,
  '00000000-0000-4000-a000-000000000002'::uuid AS barber,
  '00000000-0000-4000-a000-000000000003'::uuid AS sofia_user,
  '00000000-0000-4000-a000-000000000004'::uuid AS martin_user,
  '00000000-0000-4000-b000-000000000001'::uuid AS juan,
  '00000000-0000-4000-b000-000000000002'::uuid AS pedro,
  '00000000-0000-4000-d000-000000000001'::uuid AS sofia,
  '00000000-0000-4000-d000-000000000002'::uuid AS martin,
  '00000000-0000-4000-d000-000000000003'::uuid AS lucas,
  '00000000-0000-4000-d000-000000000004'::uuid AS lucas2;
GRANT SELECT ON ids TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 1. Separación de datos entre clientes
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; n INT; e TEXT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.sofia_user);
  SELECT count(*) INTO n FROM clients;
  PERFORM pg_temp.ok('cliente ve solo su ficha', n = 1 AND (SELECT id FROM clients) = i.sofia, n || ' filas');
  SELECT count(*) INTO n FROM loyalty_visits;
  PERFORM pg_temp.ok('cliente ve solo sus visitas', n = 7, n || ' visitas');
  SELECT count(*) INTO n FROM loyalty_rewards;
  PERFORM pg_temp.ok('cliente no ve premios ajenos', n = 0, n || ' premios');
  SELECT count(*) INTO n FROM loyalty_accounts;
  PERFORM pg_temp.ok('cliente ve solo su cuenta', n = 1);
  SELECT count(*) INTO n FROM appointments;
  PERFORM pg_temp.ok('cliente no lee la tabla de turnos', n = 0, n || ' turnos');
  SELECT count(*) INTO n FROM loyalty_events;
  PERFORM pg_temp.ok('cliente no ve la auditoría', n = 0);
  SELECT count(*) INTO n FROM marketing_consents;
  PERFORM pg_temp.ok('cliente ve solo su consentimiento', n = 1);
  SELECT count(*) INTO n FROM get_my_service_history();
  PERFORM pg_temp.ok('historial propio de servicios', n = 7, n || ' servicios');
  PERFORM pg_temp.act(i.martin_user);
  SELECT count(*) INTO n FROM loyalty_visits WHERE client_id = i.sofia;
  PERFORM pg_temp.ok('otro cliente no ve visitas de Sofía', n = 0);
END $$;

-- ---------------------------------------------------------------------
-- 2. El cliente no puede acreditarse ni canjear
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; e TEXT; n INT; r UUID;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  SELECT id INTO r FROM loyalty_rewards WHERE client_id = i.martin AND status = 'available' LIMIT 1;
  PERFORM pg_temp.act(i.martin_user);
  e := pg_temp.err(format('INSERT INTO loyalty_visits (client_id, source, visit_date) VALUES (%L, ''manual'', now())', i.martin));
  PERFORM pg_temp.ok('cliente no inserta visitas', e IS NOT NULL, e);
  e := pg_temp.err(format('UPDATE loyalty_accounts SET cycle_visits = 99 WHERE client_id = %L', i.martin));
  PERFORM pg_temp.ok('cliente no modifica su cuenta', e IS NOT NULL, e);
  e := pg_temp.err(format('UPDATE loyalty_rewards SET status = ''redeemed'' WHERE id = %L', r));
  PERFORM pg_temp.ok('cliente no modifica premios', e IS NOT NULL, e);
  e := pg_temp.err(format('SELECT redeem_reward(%L)', r));
  PERFORM pg_temp.ok('cliente no canjea su premio', e LIKE '%forbidden%', e);
  e := pg_temp.err(format('SELECT admin_add_manual_visit(%L, CURRENT_DATE, ''trampa'')', i.martin));
  PERFORM pg_temp.ok('cliente no suma visitas manuales', e LIKE '%forbidden%', e);
  e := pg_temp.err(format('SELECT staff_register_walk_in(gen_random_uuid(), %L, %L, ''Corte'', 1, 0, ''efectivo'', CURRENT_DATE)', i.martin, i.juan));
  PERFORM pg_temp.ok('cliente no registra walk-ins', e LIKE '%forbidden%', e);
  UPDATE appointments SET status = 'atendido' WHERE client_id = i.martin AND appointment_date = CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.ok('cliente no marca turnos atendidos', n = 0, n || ' filas');
  e := pg_temp.err('SELECT * FROM admin_export_marketing_contacts()');
  PERFORM pg_temp.ok('cliente no exporta', e LIKE '%forbidden%', e);
  e := pg_temp.err(format('SELECT client_marketing_opt_in(%L)', i.sofia));
  PERFORM pg_temp.ok('cliente no consulta suscripción ajena', e IS NOT NULL, e);
END $$;

-- ---------------------------------------------------------------------
-- 3. Visitante anónimo
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; e TEXT; n INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(NULL);
  SELECT count(*) INTO n FROM loyalty_visits;
  PERFORM pg_temp.ok('anónimo no ve visitas', n = 0);
  e := pg_temp.err('SELECT loyalty_register(''Intruso'', ''+5492970009999'')');
  PERFORM pg_temp.ok('anónimo no crea tarjeta', e IS NOT NULL, e);
  e := pg_temp.err('SELECT * FROM admin_export_marketing_contacts()');
  PERFORM pg_temp.ok('anónimo no exporta', e IS NOT NULL, e);
  e := pg_temp.err(format('SELECT redeem_reward(%L)', gen_random_uuid()));
  PERFORM pg_temp.ok('anónimo no canjea', e IS NOT NULL, e);
  SELECT count(*) INTO n FROM loyalty_programs WHERE active;
  PERFORM pg_temp.ok('anónimo ve el programa activo', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- 4. Restricciones del barbero
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; e TEXT; v UUID;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  SELECT id INTO v FROM loyalty_visits WHERE client_id = i.sofia LIMIT 1;
  PERFORM pg_temp.act(i.barber);
  e := pg_temp.err(format('SELECT admin_reverse_visit(%L, ''prueba'')', v));
  PERFORM pg_temp.ok('barbero no revierte visitas', e LIKE '%forbidden%', e);
  e := pg_temp.err('SELECT * FROM admin_export_marketing_contacts()');
  PERFORM pg_temp.ok('barbero no exporta', e LIKE '%forbidden%', e);
  e := pg_temp.err('SELECT admin_update_loyalty_program(3, ''Trampa'')');
  PERFORM pg_temp.ok('barbero no cambia reglas', e LIKE '%forbidden%', e);
  e := pg_temp.err(format('SELECT staff_register_walk_in(gen_random_uuid(), %L, %L, ''Corte'', 1, 0, ''efectivo'', CURRENT_DATE)', i.sofia, i.pedro));
  PERFORM pg_temp.ok('barbero no cobra a nombre de otro barbero', e LIKE '%forbidden%', e);
  e := pg_temp.err(format('SELECT admin_merge_clients(%L, %L, ''prueba'')', i.lucas2, i.lucas));
  PERFORM pg_temp.ok('barbero no une fichas', e LIKE '%forbidden%', e);
END $$;

-- ---------------------------------------------------------------------
-- 5. Acreditación única de una atención
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; a UUID; n INT; tv INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  SELECT id INTO a FROM appointments WHERE client_id = i.sofia AND appointment_date = CURRENT_DATE;
  PERFORM pg_temp.act(i.barber);
  UPDATE appointments SET status = 'atendido' WHERE id = a;
  UPDATE appointments SET status = 'atendido' WHERE id = a;          -- doble clic
  UPDATE appointments SET notes = 'nota' WHERE id = a;               -- otra edición
  UPDATE appointments SET status = 'atendido', notes = 'x' WHERE id = a;
  PERFORM pg_temp.act(i.admin);
  SELECT count(*) INTO n FROM loyalty_visits WHERE appointment_id = a AND reversed_at IS NULL;
  SELECT total_visits INTO tv FROM loyalty_accounts WHERE client_id = i.sofia;
  PERFORM pg_temp.ok('atención suma una sola vez', n = 1 AND tv = 8, n || ' visitas activas, total ' || tv);

  -- Volver a "confirmado" revierte; volver a "atendido" acredita de nuevo, una vez
  UPDATE appointments SET status = 'confirmado' WHERE id = a;
  SELECT total_visits INTO tv FROM loyalty_accounts WHERE client_id = i.sofia;
  PERFORM pg_temp.ok('desmarcar atendido revierte la visita', tv = 7, 'total ' || tv);
  UPDATE appointments SET status = 'atendido' WHERE id = a;
  SELECT count(*) INTO n FROM loyalty_visits WHERE appointment_id = a AND reversed_at IS NULL;
  SELECT total_visits INTO tv FROM loyalty_accounts WHERE client_id = i.sofia;
  PERFORM pg_temp.ok('re-marcar atendido acredita una vez', n = 1 AND tv = 8, n || ' activas, total ' || tv);
  SELECT count(*) INTO n FROM loyalty_events WHERE client_id = i.sofia AND event_type = 'visit_reversed' AND actor_id = i.admin;
  PERFORM pg_temp.ok('reversión registra quién la hizo', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- 6. Cancelaciones y ausencias no suman
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; a UUID; n INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  SELECT count(*) INTO n FROM loyalty_visits WHERE client_id = i.lucas;
  PERFORM pg_temp.ok('turno cancelado y ausente no suman', n = 0);
  SELECT id INTO a FROM appointments WHERE client_id = i.lucas AND appointment_date = CURRENT_DATE;
  PERFORM pg_temp.act(i.barber);
  UPDATE appointments SET status = 'cancelado' WHERE id = a;
  PERFORM pg_temp.act(i.admin);
  SELECT count(*) INTO n FROM loyalty_visits WHERE client_id = i.lucas;
  PERFORM pg_temp.ok('cancelar un turno no suma', n = 0);
END $$;

-- ---------------------------------------------------------------------
-- 7. Generación y canje único de premios
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; r UUID; n INT; c INT; e TEXT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.admin);
  -- Sofía está en 8: dos visitas más completan el ciclo de 10
  PERFORM admin_add_manual_visit(i.sofia, CURRENT_DATE, 'Prueba ciclo 1');
  PERFORM admin_add_manual_visit(i.sofia, CURRENT_DATE, 'Prueba ciclo 2');
  SELECT count(*), max(id::text)::uuid INTO n, r FROM loyalty_rewards WHERE client_id = i.sofia AND status = 'available';
  SELECT cycle_visits INTO c FROM loyalty_accounts WHERE client_id = i.sofia;
  PERFORM pg_temp.ok('a las 10 visitas se genera un premio', n = 1 AND c = 0, n || ' premios, ciclo ' || c);
  e := pg_temp.err(format('SELECT admin_add_manual_visit(%L, CURRENT_DATE, '' '')', i.sofia));
  PERFORM pg_temp.ok('corrección sin motivo se rechaza', e LIKE '%reason_required%', e);

  PERFORM pg_temp.act(i.barber);
  PERFORM redeem_reward(r, 'Canje en caja');
  e := pg_temp.err(format('SELECT redeem_reward(%L)', r));
  PERFORM pg_temp.ok('premio no se canjea dos veces', e LIKE '%reward_not_available%', e);
  PERFORM pg_temp.act(i.admin);
  SELECT count(*) INTO n FROM loyalty_rewards WHERE id = r AND status = 'redeemed' AND redeemed_by = i.barber;
  PERFORM pg_temp.ok('canje registra quién lo confirmó', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- 8. Reversiones que afectan premios
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; v UUID; c INT; n INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.admin);
  -- Martín: premio disponible y ciclo 0 → revertir anula el premio y restaura 9/10
  SELECT id INTO v FROM loyalty_visits WHERE client_id = i.martin AND reversed_at IS NULL ORDER BY credited_at DESC LIMIT 1;
  PERFORM admin_reverse_visit(v, 'Visita cargada por error');
  SELECT cycle_visits INTO c FROM loyalty_accounts WHERE client_id = i.martin;
  SELECT count(*) INTO n FROM loyalty_rewards WHERE client_id = i.martin AND status = 'voided';
  PERFORM pg_temp.ok('revertir con premio sin canjear lo anula', c = 9 AND n = 1, 'ciclo ' || c || ', anulados ' || n);
  PERFORM pg_temp.ok('revertir dos veces no descuenta dos veces', NOT admin_reverse_visit(v, 'otra vez'));

  -- Sofía: premio ya canjeado y ciclo 0 → el premio se mantiene, ciclo -1
  SELECT id INTO v FROM loyalty_visits WHERE client_id = i.sofia AND reversed_at IS NULL ORDER BY credited_at DESC LIMIT 1;
  PERFORM admin_reverse_visit(v, 'Visita cargada por error');
  SELECT cycle_visits INTO c FROM loyalty_accounts WHERE client_id = i.sofia;
  SELECT count(*) INTO n FROM loyalty_rewards WHERE client_id = i.sofia AND status = 'redeemed';
  PERFORM pg_temp.ok('revertir con premio canjeado deja ciclo en -1', c = -1 AND n = 1, 'ciclo ' || c);
END $$;

-- ---------------------------------------------------------------------
-- 9. Cambio de reglas: premios ganados conservan sus condiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; n INT; d TEXT; vr INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.admin);
  PERFORM admin_update_loyalty_program(3, 'Corte gratis');
  SELECT count(*) INTO n FROM loyalty_programs WHERE active;
  PERFORM pg_temp.ok('un solo programa activo tras el cambio', n = 1);
  SELECT count(*) INTO n FROM loyalty_rewards WHERE client_id = i.sofia AND reward_description LIKE 'DEMO%' AND visits_required = 10;
  PERFORM pg_temp.ok('premio anterior conserva sus condiciones', n = 1);
  -- Lucas2 (sin visitas): 3 visitas con la regla nueva → premio nuevo
  PERFORM admin_add_manual_visit(i.lucas2, CURRENT_DATE, 'Regla nueva 1');
  PERFORM admin_add_manual_visit(i.lucas2, CURRENT_DATE, 'Regla nueva 2');
  PERFORM admin_add_manual_visit(i.lucas2, CURRENT_DATE, 'Regla nueva 3');
  SELECT reward_description, visits_required INTO d, vr FROM loyalty_rewards WHERE client_id = i.lucas2;
  PERFORM pg_temp.ok('premio nuevo usa la regla vigente', d = 'Corte gratis' AND vr = 3, d || ' / ' || vr);
  -- Martín estaba en 9 con regla de 10; con regla de 3, su próxima visita genera premio(s)
  PERFORM admin_add_manual_visit(i.martin, CURRENT_DATE, 'Regla nueva');
  SELECT count(*) INTO n FROM loyalty_rewards WHERE client_id = i.martin AND status = 'available';
  PERFORM pg_temp.ok('bajar la regla aplica en la próxima visita', n = 3, n || ' premios (10 visitas / 3)');
  SELECT count(*) INTO n FROM loyalty_events WHERE event_type = 'program_changed';
  PERFORM pg_temp.ok('cambio de reglas queda auditado', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- 10. Registro, verificación de email y consentimiento
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; u UUID := gen_random_uuid(); cid UUID; cid2 UUID; e TEXT; n INT; em TEXT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'Nuevo.Cliente@MVP.test',
          '{"provider":"email"}', now(), now());
  PERFORM pg_temp.act(u);
  e := pg_temp.err('SELECT loyalty_register(''Nuevo'', ''+5492970001111'')');
  PERFORM pg_temp.ok('sin email verificado no se crea la tarjeta', e LIKE '%email_not_verified%', e);
  PERFORM pg_temp.act(i.admin);
  RESET role;
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = u;
  PERFORM pg_temp.act(u);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''+5492970001111'')');
  PERFORM pg_temp.ok('sin aceptar condiciones no se crea la tarjeta', e LIKE '%terms_not_accepted%', e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''+5492970001111'', _terms_version => ''privacidad-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('la versión de privacidad no sirve como aceptación de condiciones', e LIKE '%terms_not_accepted%', e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => NULL, _whatsapp_opt_in => true, _whatsapp_consent_version => ''wa-v1-2026-10'', _terms_version => ''terminos-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('aceptar WhatsApp sin número se rechaza', e LIKE '%invalid_whatsapp%', e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''123'', _terms_version => ''terminos-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('WhatsApp con formato inválido se rechaza', e LIKE '%invalid_whatsapp%', e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''+5492970001111'', _birth_day => 31::smallint, _birth_month => 2::smallint, _terms_version => ''terminos-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('cumpleaños inválido (31/02) se rechaza', e IS NOT NULL, e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''+5492970001111'', _marketing_opt_in => true, _consent_version => ''v-inventada'', _terms_version => ''terminos-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('versión de texto desconocida se rechaza', e LIKE '%unknown_consent_version%', e);
  e := pg_temp.err('SELECT loyalty_register(_first_name => ''Nuevo'', _whatsapp => ''+5492970001111'', _whatsapp_opt_in => true, _whatsapp_consent_version => ''v1-2026-10'', _terms_version => ''terminos-v2-2026-10'', _privacy_notice_version => ''privacidad-v2-2026-10'')');
  PERFORM pg_temp.ok('texto de email no sirve como consentimiento de WhatsApp', e LIKE '%unknown_consent_version%', e);
  cid := loyalty_register(_first_name => 'Nuevo', _whatsapp => '+54 9 297 000-1111', _birth_day => 29::smallint, _birth_month => 2::smallint, _terms_version => 'terminos-v2-2026-10', _privacy_notice_version => 'privacidad-v2-2026-10');
  cid2 := loyalty_register(_first_name => 'Otro nombre', _whatsapp => '+5492970002222', _terms_version => 'terminos-v2-2026-10', _privacy_notice_version => 'privacidad-v2-2026-10');
  PERFORM pg_temp.ok('registro repetido devuelve la misma tarjeta', cid = cid2);
  SELECT email INTO em FROM clients WHERE id = cid;
  PERFORM pg_temp.ok('email tomado de la sesión y normalizado', em = 'nuevo.cliente@mvp.test', em);
  SELECT whatsapp INTO em FROM clients WHERE id = cid;
  PERFORM pg_temp.ok('WhatsApp guardado normalizado', em = '+5492970001111', em);
  SELECT count(*) INTO n FROM marketing_consents WHERE client_id = cid;
  PERFORM pg_temp.ok('sin marcar la casilla no queda suscripto', n = 0);
  PERFORM set_my_marketing_consent(true, 'v1-2026-10');
  PERFORM set_my_marketing_consent(true, 'v1-2026-10');
  SELECT count(*) INTO n FROM marketing_consents WHERE client_id = cid;
  PERFORM pg_temp.ok('suscripción guarda un solo registro', n = 1);
  PERFORM set_my_marketing_consent(false, 'v1-2026-10');
  SELECT count(*) INTO n FROM marketing_consents WHERE client_id = cid AND NOT granted AND source = 'customer_panel';
  PERFORM pg_temp.ok('baja queda registrada con origen', n = 1);
  PERFORM set_my_marketing_consent(true, 'wa-v1-2026-10');
  SELECT count(*) INTO n FROM marketing_consents WHERE client_id = cid AND channel = 'whatsapp' AND granted AND email = '+5492970001111';
  PERFORM pg_temp.ok('acepta WhatsApp: se guarda en su canal con el número', n = 1);
  PERFORM set_my_marketing_consent(false, 'v1-2026-10');
  SELECT count(*) INTO n FROM marketing_consents WHERE client_id = cid AND channel = 'whatsapp' AND NOT granted;
  PERFORM pg_temp.ok('baja de email no da de baja WhatsApp', n = 0);
  e := pg_temp.err('SELECT update_my_profile(''Nuevo'', NULL, NULL, NULL, ''abc'')');
  PERFORM pg_temp.ok('no se puede borrar el WhatsApp mientras acepta mensajes por ese canal', e LIKE '%whatsapp_required_for_opt_in%', e);
  e := pg_temp.err('SELECT update_my_profile(''Nuevo'', NULL, NULL, NULL, ''12345'')');
  PERFORM pg_temp.ok('WhatsApp con formato inválido en el perfil se rechaza', e LIKE '%invalid_whatsapp%', e);
END $$;

-- ---------------------------------------------------------------------
-- 11. Exportación: solo consentimiento vigente, sin bajas
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; tok UUID; n INT; emails TEXT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.admin);
  SELECT string_agg(email, ',' ORDER BY email), count(*) INTO emails, n FROM admin_export_marketing_contacts();
  PERFORM pg_temp.ok('exporta solo suscriptos verificados', emails = 'cliente@mvp.test,sofia@mvp.test', coalesce(emails, '(vacío)'));
  SELECT count(*) INTO n FROM data_export_log WHERE exported_by = i.admin;
  PERFORM pg_temp.ok('exportación queda registrada', n = 1);

  SELECT unsubscribe_token INTO tok FROM clients WHERE id = i.sofia;
  PERFORM pg_temp.act(NULL);
  PERFORM pg_temp.ok('baja por link funciona sin sesión', unsubscribe_by_token(tok));
  PERFORM pg_temp.ok('link con token inventado no hace nada', NOT unsubscribe_by_token(gen_random_uuid()));
  PERFORM pg_temp.act(i.admin);
  SELECT string_agg(email, ','), count(*) INTO emails, n FROM admin_export_marketing_contacts();
  PERFORM pg_temp.ok('baja excluye de la exportación', emails = 'cliente@mvp.test', coalesce(emails, '(vacío)'));
  SELECT count(*) INTO n FROM admin_export_marketing_contacts() WHERE whatsapp = '+5492970000005' AND whatsapp_opt_in;
  PERFORM pg_temp.ok('exportación incluye WhatsApp y su consentimiento', n = 1);
END $$;

-- ---------------------------------------------------------------------
-- 12. Walk-in idempotente y unión de duplicados
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; p UUID := gen_random_uuid(); n INT; m INT; e TEXT; tv INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  PERFORM pg_temp.act(i.barber);
  PERFORM staff_register_walk_in(p, i.lucas, i.juan, 'Corte', 12000, 0, 'efectivo', CURRENT_DATE);
  PERFORM staff_register_walk_in(p, i.lucas, i.juan, 'Corte', 12000, 0, 'efectivo', CURRENT_DATE);  -- reintento
  PERFORM pg_temp.act(i.admin);
  SELECT count(*) INTO n FROM payments WHERE id = p;
  SELECT count(*) INTO m FROM loyalty_visits WHERE payment_id = p AND reversed_at IS NULL;
  PERFORM pg_temp.ok('walk-in reintentado: 1 cobro y 1 visita', n = 1 AND m = 1, n || ' cobros, ' || m || ' visitas');

  -- Lucas2 (3 visitas, 1 premio) se une a Lucas (1 visita)
  PERFORM admin_merge_clients(i.lucas2, i.lucas, 'Misma persona, confirmado en el local');
  SELECT count(*) INTO n FROM clients WHERE id = i.lucas2;
  SELECT total_visits INTO tv FROM loyalty_accounts WHERE client_id = i.lucas;
  SELECT count(*) INTO m FROM loyalty_rewards WHERE client_id = i.lucas;
  PERFORM pg_temp.ok('unión mueve visitas y premios', n = 0 AND tv = 4 AND m = 1, 'total ' || tv || ', premios ' || m);
  e := pg_temp.err(format('SELECT admin_merge_clients(%L, %L, ''prueba'')', i.sofia, i.martin));
  PERFORM pg_temp.ok('no se unen dos cuentas verificadas', e LIKE '%both_verified%', e);
END $$;

-- ---------------------------------------------------------------------
-- 13. Registro de aceptación legal, minimización y cancelación
-- ---------------------------------------------------------------------
DO $$
DECLARE i ids; e TEXT; n INT; a UUID := gen_random_uuid(); a_near UUID := gen_random_uuid();
  a_far UUID := gen_random_uuid(); s UUID; tv TEXT; pv TEXT; ts TIMESTAMPTZ; near TIMESTAMP; cols INT;
BEGIN
  RESET role;
  SELECT * INTO i FROM ids;
  SELECT id INTO s FROM services ORDER BY display_order LIMIT 1;

  -- Reserva web: sin versiones se rechaza, con versiones queda registrada
  PERFORM pg_temp.act(NULL);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status) VALUES ('Ana Web', '2970009991', %L, 'Corte', %L, CURRENT_DATE + 5, '10:07', 'pendiente')$q$, s, i.pedro));
  PERFORM pg_temp.ok('reserva web sin aceptar condiciones se rechaza', e IS NOT NULL, e);
  e := pg_temp.err(format($q$INSERT INTO appointments (id, client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status, terms_version, privacy_notice_version)
    VALUES (%L, 'Ana Web', '2970009991', %L, 'Corte', %L, CURRENT_DATE + 5, '10:07', 'pendiente', 'terminos-v2-2026-10', 'privacidad-v2-2026-10')$q$, a, s, i.pedro));
  PERFORM pg_temp.ok('reserva web con condiciones aceptadas se guarda', e IS NULL, e);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status, terms_version, privacy_notice_version)
    VALUES ('Ana Web', '2970009991', %L, 'Corte', %L, CURRENT_DATE + 6, '10:07', 'pendiente', 'terminos-inventados', 'privacidad-v2-2026-10')$q$, s, i.pedro));
  PERFORM pg_temp.ok('versión de condiciones inexistente se rechaza', e IS NOT NULL, e);

  -- La prueba se puede recuperar y no se puede alterar
  PERFORM pg_temp.act(i.admin);
  SELECT terms_version, privacy_notice_version, created_at INTO tv, pv, ts FROM appointments WHERE id = a;
  PERFORM pg_temp.ok('admin recupera qué aceptó y cuándo', tv = 'terminos-v2-2026-10' AND pv = 'privacidad-v2-2026-10' AND ts IS NOT NULL,
    coalesce(tv, '(null)') || ' / ' || coalesce(pv, '(null)'));
  e := pg_temp.err(format($q$UPDATE appointments SET terms_version = NULL, privacy_notice_version = NULL WHERE id = %L$q$, a));
  PERFORM pg_temp.ok('nadie puede borrar o cambiar la aceptación', e LIKE '%legal_acceptance_immutable%', e);
  e := pg_temp.err(format($q$UPDATE appointments SET status = 'confirmado' WHERE id = %L$q$, a));
  PERFORM pg_temp.ok('el turno se sigue pudiendo confirmar', e IS NULL, e);
  e := pg_temp.err(format($q$INSERT INTO appointments (client_name, client_phone, service_id, service_name, barber_id,
    appointment_date, appointment_time, status) VALUES ('Walk Admin', '2970009992', %L, 'Corte', %L, CURRENT_DATE + 5, '11:07', 'pendiente')$q$, s, i.pedro));
  PERFORM pg_temp.ok('el personal carga turnos sin casilla (no es aceptación del cliente)', e IS NULL, e);

  -- Tarjeta: la aceptación queda en la cuenta
  RESET role;
  SELECT la.terms_version, la.terms_accepted_at INTO tv, ts FROM loyalty_accounts la
    JOIN clients c ON c.id = la.client_id WHERE c.email = 'nuevo.cliente@mvp.test';
  PERFORM pg_temp.ok('alta de tarjeta registra versión y fecha', tv = 'terminos-v2-2026-10' AND ts IS NOT NULL, coalesce(tv, '(null)'));

  -- WhatsApp opcional al crear la tarjeta
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  VALUES ('00000000-0000-0000-0000-000000000000', a_far, 'authenticated', 'authenticated', 'sin.wa@mvp.test',
          '{"provider":"email"}', now(), now(), now());
  PERFORM pg_temp.act(a_far);
  e := pg_temp.err($q$SELECT loyalty_register(_first_name => 'SinWa', _terms_version => 'terminos-v2-2026-10', _privacy_notice_version => 'privacidad-v2-2026-10')$q$);
  PERFORM pg_temp.ok('se puede crear la tarjeta sin WhatsApp', e IS NULL, e);

  -- Búsqueda por teléfono: solo devuelve el id
  PERFORM pg_temp.act(NULL);
  SELECT count(*) INTO n FROM get_client_by_phone('2970000003');
  RESET role;
  SELECT count(*) INTO cols FROM information_schema.routines r
    JOIN information_schema.parameters p ON p.specific_name = r.specific_name
    WHERE r.routine_schema = 'public' AND r.routine_name = 'get_client_by_phone' AND p.parameter_mode = 'OUT';
  PERFORM pg_temp.ok('búsqueda por teléfono no expone nombre, email ni nacimiento', n = 1 AND cols = 1, 'columnas: ' || cols);

  -- Cancelación online: solo con más de 3 h de anticipación
  near := date_trunc('minute', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + INTERVAL '2 hours 3 minutes';
  INSERT INTO appointments (id, client_name, client_phone, service_id, service_name, barber_id, appointment_date, appointment_time, status)
  VALUES (a_near, 'Ana Web', '2970009991', s, 'Corte', i.pedro, near::date, near::time, 'pendiente');
  PERFORM pg_temp.act(NULL);
  PERFORM pg_temp.ok('no se cancela online con menos de 3 h', NOT cancel_my_appointment('2970009991', a_near));
  PERFORM pg_temp.ok('se cancela online con más de 3 h', cancel_my_appointment('2970009991', a));
  PERFORM pg_temp.ok('con otro teléfono no se cancela', NOT cancel_my_appointment('2970000001', a_near));
END $$;

RESET role;
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM results ORDER BY n;
ROLLBACK;
