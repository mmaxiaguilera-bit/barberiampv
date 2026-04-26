-- Fix search_path on update_updated_at and handle_new_user
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Tighten public insert policy on appointments with validation
DROP POLICY IF EXISTS "Anyone create appointment" ON public.appointments;
CREATE POLICY "Anyone create valid appointment" ON public.appointments
FOR INSERT
WITH CHECK (
  length(trim(client_name)) BETWEEN 2 AND 100
  AND length(trim(client_phone)) BETWEEN 6 AND 25
  AND length(trim(service_name)) BETWEEN 1 AND 100
  AND appointment_date >= CURRENT_DATE
  AND status = 'pendiente'
);
