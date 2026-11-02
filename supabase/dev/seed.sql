-- =====================================================================
-- DATOS DE DEMO — SOLO PARA LA BASE DE PRUEBAS (mvp-barber-dev)
-- Nunca ejecutar en producción. Uso: npm run db:seed:dev
-- Todos los datos son ficticios. Emails @mvp.test (dominio inexistente).
-- Contraseña de todos los usuarios demo: MvpDemo2026!
-- =====================================================================

-- La app usa has_any_admin() pero no está en las migraciones del repo
-- (existe solo en producción). Se recrea acá para que el entorno de prueba funcione.
CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO anon, authenticated;

-- Los datos demo tienen visitas con fechas pasadas: se adelanta el inicio de la
-- tarjeta mientras se cargan y al final se vuelve a la fecha real de lanzamiento.
UPDATE public.loyalty_settings SET starts_on = DATE '2000-01-01';

DO $$
DECLARE
  u_admin   UUID := '00000000-0000-4000-a000-000000000001';
  u_barber  UUID := '00000000-0000-4000-a000-000000000002';
  u_cli1    UUID := '00000000-0000-4000-a000-000000000003';
  u_cli2    UUID := '00000000-0000-4000-a000-000000000004';
  b_juan    UUID := '00000000-0000-4000-b000-000000000001';
  b_pedro   UUID := '00000000-0000-4000-b000-000000000002';
  s_corte   UUID := '00000000-0000-4000-c000-000000000001';
  s_barba   UUID := '00000000-0000-4000-c000-000000000002';
  c_sofia   UUID := '00000000-0000-4000-d000-000000000001';
  c_martin  UUID := '00000000-0000-4000-d000-000000000002';
  c_lucas   UUID := '00000000-0000-4000-d000-000000000003';
  c_lucas2  UUID := '00000000-0000-4000-d000-000000000004';
  r RECORD;
  i INT;
  a_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = u_admin) THEN
    RAISE NOTICE 'Seed demo ya cargado, no se repite.';
    RETURN;
  END IF;

  -- Usuarios (email confirmado, login con contraseña solo para pruebas)
  FOR r IN SELECT * FROM (VALUES
    (u_admin,  'admin@mvp.test',   'Admin Demo'),
    (u_barber, 'barbero@mvp.test', 'Juan Barbero Demo'),
    (u_cli1,   'sofia@mvp.test',   'Sofía Demo'),
    (u_cli2,   'martin@mvp.test',  'Martín Demo')
  ) AS t(id, email, name) LOOP
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
            extensions.crypt('MvpDemo2026!', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name),
            now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), r.id, r.id::text,
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
            'email', now(), now(), now());
  END LOOP;

  INSERT INTO public.user_roles (user_id, role) VALUES (u_admin, 'admin'), (u_barber, 'barber');

  INSERT INTO public.barbers (id, user_id, name, bio, display_order) VALUES
    (b_juan, u_barber, 'Juan (demo)', 'Barbero de prueba', 1),
    (b_pedro, NULL, 'Pedro (demo)', 'Barbero de prueba sin usuario', 2);

  INSERT INTO public.services (id, name, description, duration_minutes, price, display_order) VALUES
    (s_corte, 'Corte', 'Corte clásico o moderno', 45, 12000, 1),
    (s_barba, 'Corte + Barba', 'Corte y perfilado de barba', 60, 16000, 2);

  -- Lunes a sábado 10–21
  FOR i IN 1..6 LOOP
    INSERT INTO public.schedules (barber_id, day_of_week, start_time, end_time, slot_minutes)
    VALUES (b_juan, i, '10:00', '21:00', 45), (b_pedro, i, '10:00', '21:00', 45);
  END LOOP;

  -- Clientes
  -- Sofía: tarjeta creada, suscripta a promociones, 7 visitas
  INSERT INTO public.clients (id, first_name, last_name, phone, email, birth_day, birth_month, user_id, source)
  VALUES (c_sofia, 'Sofía', 'Demo', '2970000001', 'sofia@mvp.test', 14, 3, u_cli1, 'loyalty_signup');
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  VALUES (c_sofia, true, 'sofia@mvp.test', 'v1-2026-10', 'signup', u_cli1);

  -- Martín: tarjeta creada, sin promociones, 10 visitas → 1 premio disponible
  INSERT INTO public.clients (id, first_name, last_name, phone, email, user_id, source)
  VALUES (c_martin, 'Martín', 'Demo', '2970000002', 'martin@mvp.test', u_cli2, 'loyalty_signup');

  -- Lucas: solo reservó (sin tarjeta). Tiene un duplicado cargado por el personal.
  INSERT INTO public.clients (id, first_name, last_name, phone, email, source)
  VALUES (c_lucas, 'Lucas', 'Reserva', '2970000003', 'lucas@mvp.test', 'booking');
  INSERT INTO public.clients (id, first_name, last_name, phone, source)
  VALUES (c_lucas2, 'Lucas', 'Reserva', NULL, 'staff');

  -- Turnos atendidos en el pasado. Se insertan pendientes y se marcan
  -- atendidos para que el trigger acredite igual que en el flujo real.
  FOR r IN SELECT * FROM (VALUES (c_sofia, 'Sofía Demo', '2970000001', 7, '11:00'::time),
                                 (c_martin, 'Martín Demo', '2970000002', 10, '15:00'::time)) AS t(cid, name, phone, n, hora) LOOP
    FOR i IN 1..r.n LOOP
      INSERT INTO public.appointments (client_id, client_name, client_phone, service_id, service_name, service_price,
                                       service_duration_minutes, barber_id, appointment_date, appointment_time, status)
      VALUES (r.cid, r.name, r.phone, s_corte, 'Corte', 12000, 45, b_juan,
              CURRENT_DATE - (i * 14), r.hora, 'pendiente')
      RETURNING id INTO a_id;
      UPDATE public.appointments SET status = 'atendido' WHERE id = a_id;
    END LOOP;
  END LOOP;

  -- Lucas: un turno cancelado y uno ausente (sigue "confirmado" en el pasado): no suman
  INSERT INTO public.appointments (client_id, client_name, client_phone, service_id, service_name, service_price,
                                   service_duration_minutes, barber_id, appointment_date, appointment_time, status)
  VALUES (c_lucas, 'Lucas Reserva', '2970000003', s_corte, 'Corte', 12000, 45, b_pedro, CURRENT_DATE - 3, '12:00', 'cancelado'),
         (c_lucas, 'Lucas Reserva', '2970000003', s_corte, 'Corte', 12000, 45, b_pedro, CURRENT_DATE - 2, '12:00', 'confirmado');

  -- Turnos de hoy para probar el cobro desde el panel
  INSERT INTO public.appointments (client_id, client_name, client_phone, service_id, service_name, service_price,
                                   service_duration_minutes, barber_id, appointment_date, appointment_time, status)
  VALUES (c_sofia, 'Sofía Demo', '2970000001', s_corte, 'Corte', 12000, 45, b_juan, CURRENT_DATE, '18:00', 'confirmado'),
         (c_martin, 'Martín Demo', '2970000002', s_barba, 'Corte + Barba', 16000, 60, b_juan, CURRENT_DATE, '19:00', 'confirmado'),
         (c_lucas, 'Lucas Reserva', '2970000003', s_corte, 'Corte', 12000, 45, b_juan, CURRENT_DATE, '20:00', 'pendiente');
END $$;

-- ---------------------------------------------------------------------
-- Cliente de demostración para revisar la tarjeta "con uso":
-- 26 visitas → 2 premios (el primero canjeado, el segundo disponible) y 6/10.
-- Login de prueba: cliente@mvp.test / MvpDemo2026! (pantalla /auth)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  u_demo  UUID := '00000000-0000-4000-a000-000000000005';
  c_demo  UUID := '00000000-0000-4000-d000-000000000005';
  b_juan  UUID := '00000000-0000-4000-b000-000000000001';
  b_pedro UUID := '00000000-0000-4000-b000-000000000002';
  i INT;
  a_id UUID;
  r_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = u_demo) THEN
    RAISE NOTICE 'Cliente demo ya cargado.';
    RETURN;
  END IF;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES ('00000000-0000-0000-0000-000000000000', u_demo, 'authenticated', 'authenticated', 'cliente@mvp.test',
          extensions.crypt('MvpDemo2026!', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"full_name":"Cliente Demo"}',
          now(), now(), '', '', '', '');
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), u_demo, u_demo::text,
          jsonb_build_object('sub', u_demo::text, 'email', 'cliente@mvp.test', 'email_verified', true),
          'email', now(), now(), now());

  INSERT INTO public.clients (id, first_name, last_name, phone, email, birth_day, birth_month, user_id, source)
  VALUES (c_demo, 'Cliente', 'Demo', '2970000005', 'cliente@mvp.test', 22, 10, u_demo, 'loyalty_signup');
  INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
  VALUES (c_demo, true, 'cliente@mvp.test', 'v1-2026-10', 'signup', u_demo);

  -- 26 turnos atendidos, uno por semana, alternando barbero y servicio
  FOR i IN 1..26 LOOP
    INSERT INTO public.appointments (client_id, client_name, client_phone, service_id, service_name, service_price,
                                     service_duration_minutes, barber_id, appointment_date, appointment_time, status)
    VALUES (c_demo, 'Cliente Demo', '2970000005',
            CASE WHEN i % 3 = 0 THEN '00000000-0000-4000-c000-000000000002'::uuid ELSE '00000000-0000-4000-c000-000000000001'::uuid END,
            CASE WHEN i % 3 = 0 THEN 'Corte + Barba' ELSE 'Corte' END,
            CASE WHEN i % 3 = 0 THEN 16000 ELSE 12000 END,
            CASE WHEN i % 3 = 0 THEN 60 ELSE 45 END,
            CASE WHEN i % 2 = 0 THEN b_pedro ELSE b_juan END,
            CURRENT_DATE - (i * 7), '17:00', 'pendiente')
    RETURNING id INTO a_id;
    UPDATE public.appointments SET status = 'atendido' WHERE id = a_id;
  END LOOP;

  -- Canjear el primer premio (como si lo hubiera usado el personal)
  SELECT id INTO r_id FROM public.loyalty_rewards WHERE client_id = c_demo ORDER BY earned_at, id LIMIT 1;
  UPDATE public.loyalty_rewards
  SET status = 'redeemed', redeemed_at = now() - interval '60 days', redeemed_by = '00000000-0000-4000-a000-000000000002',
      redemption_note = 'Canje de demostración'
  WHERE id = r_id;
  INSERT INTO public.loyalty_events (client_id, event_type, reward_id, actor_id, reason)
  VALUES (c_demo, 'reward_redeemed', r_id, '00000000-0000-4000-a000-000000000002', 'Canje de demostración');
END $$;

-- ---------------------------------------------------------------------
-- WhatsApp de las tarjetas demo (obligatorio desde 20261022140000).
-- Cliente Demo además aceptó recibir avisos por WhatsApp.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.clients SET whatsapp = '+5492970000001' WHERE id = '00000000-0000-4000-d000-000000000001' AND whatsapp IS NULL;
  UPDATE public.clients SET whatsapp = '+5492970000002' WHERE id = '00000000-0000-4000-d000-000000000002' AND whatsapp IS NULL;
  IF EXISTS (SELECT 1 FROM public.clients WHERE id = '00000000-0000-4000-d000-000000000005' AND whatsapp IS NULL) THEN
    UPDATE public.clients SET whatsapp = '+5492970000005' WHERE id = '00000000-0000-4000-d000-000000000005';
    INSERT INTO public.marketing_consents (client_id, granted, email, text_version, source, actor_id)
    VALUES ('00000000-0000-4000-d000-000000000005', true, '+5492970000005', 'wa-v1-2026-10', 'signup',
            '00000000-0000-4000-a000-000000000005');
  END IF;
END $$;

-- Fecha real de lanzamiento de la tarjeta (igual que la migración)
UPDATE public.loyalty_settings SET starts_on = DATE '2026-11-02';
