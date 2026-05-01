-- Add optional email to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email TEXT;

-- Update get_client_by_phone to also return email
CREATE OR REPLACE FUNCTION public.get_client_by_phone(_phone TEXT)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT, birth_date DATE, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, first_name, last_name, birth_date, email
  FROM public.clients
  WHERE phone = _phone
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_client_by_phone(TEXT) TO anon, authenticated;

-- Public function: get upcoming appointments by phone (client portal)
CREATE OR REPLACE FUNCTION public.get_my_appointments(_phone TEXT)
RETURNS TABLE (
  id UUID,
  appointment_date DATE,
  appointment_time TIME,
  service_name TEXT,
  barber_name TEXT,
  status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.id,
    a.appointment_date,
    a.appointment_time,
    a.service_name,
    COALESCE(b.name, '—') AS barber_name,
    a.status::TEXT
  FROM public.appointments a
  LEFT JOIN public.barbers b ON b.id = a.barber_id
  WHERE a.client_phone = _phone
    AND a.appointment_date >= CURRENT_DATE
  ORDER BY a.appointment_date, a.appointment_time
  LIMIT 10
$$;
GRANT EXECUTE ON FUNCTION public.get_my_appointments(TEXT) TO anon, authenticated;

-- Public function: client cancels their own appointment (phone is verification)
CREATE OR REPLACE FUNCTION public.cancel_my_appointment(_phone TEXT, _appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status::TEXT INTO v_status
  FROM public.appointments
  WHERE id = _appointment_id AND client_phone = _phone;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_status IN ('cancelado', 'atendido') THEN RETURN FALSE; END IF;

  UPDATE public.appointments
  SET status = 'cancelado'
  WHERE id = _appointment_id AND client_phone = _phone;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_my_appointment(TEXT, UUID) TO anon, authenticated;
