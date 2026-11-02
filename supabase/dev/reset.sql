-- =====================================================================
-- REINICIO DE LA BASE DE PRUEBAS (mvp-barber-dev) — NUNCA EN PRODUCCIÓN
-- Borra todos los datos de la app y los usuarios @mvp.test, y deja el
-- programa DEMO como único programa. Después correr el seed.
-- Uso: npm run db:reset:dev
-- =====================================================================
TRUNCATE public.loyalty_events, public.loyalty_rewards, public.loyalty_visits, public.loyalty_accounts,
         public.marketing_consents, public.data_export_log, public.payments, public.appointments,
         public.clients, public.barber_blocks, public.schedules, public.services, public.barbers,
         public.cash_closures, public.expenses, public.access_requests, public.user_roles,
         public.loyalty_programs CASCADE;

INSERT INTO public.loyalty_programs (name, visits_required, reward_description, is_demo)
VALUES ('Programa DEMO', 10, 'DEMO — beneficio a definir por MVP Barber', true);

DELETE FROM auth.users WHERE email LIKE '%@mvp.test';
