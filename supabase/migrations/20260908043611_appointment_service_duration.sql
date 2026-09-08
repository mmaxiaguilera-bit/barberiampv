-- Availability was computed using the barber's schedule slot_minutes (e.g. 40)
-- instead of the booked service's real duration, so a 60-minute service only
-- blocked its own start slot and left later slots (e.g. +40min) available.
-- Snapshot the service duration on the appointment (like service_name/service_price
-- already are) so availability checks can use the real occupied interval.

ALTER TABLE public.appointments
  ADD COLUMN service_duration_minutes INT NOT NULL DEFAULT 45;

UPDATE public.appointments a
SET service_duration_minutes = s.duration_minutes
FROM public.services s
WHERE a.service_id = s.id;

DROP FUNCTION IF EXISTS public.get_taken_slots(uuid, date);
CREATE FUNCTION public.get_taken_slots(_barber_id UUID, _date DATE)
RETURNS TABLE (appointment_time TIME, duration_minutes INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT appointment_time, service_duration_minutes
  FROM public.appointments
  WHERE barber_id = _barber_id
    AND appointment_date = _date
    AND status <> 'cancelado'
$$;
GRANT EXECUTE ON FUNCTION public.get_taken_slots(UUID, DATE) TO anon, authenticated;
