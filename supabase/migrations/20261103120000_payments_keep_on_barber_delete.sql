-- Borrar un barbero no debe borrar ni trabar sus cobros.
-- Antes: payments.barber_id era NOT NULL con ON DELETE RESTRICT, así que un
-- barbero con cobros no se podía borrar ("payments_barber_id_fkey").
-- Ahora: el cobro guarda el nombre del barbero (barber_name) y, si el barbero
-- se borra, barber_id queda en NULL. Caja y Reportes siguen mostrando el nombre.

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS barber_name TEXT;

UPDATE public.payments p
SET barber_name = b.name
FROM public.barbers b
WHERE b.id = p.barber_id AND p.barber_name IS NULL;

ALTER TABLE public.payments ALTER COLUMN barber_id DROP NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_barber_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_barber_id_fkey
  FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE SET NULL;

-- Cada cobro nuevo (o al que se le cambia el barbero) guarda el nombre
CREATE OR REPLACE FUNCTION public.payments_set_barber_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.barber_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.barber_id IS DISTINCT FROM OLD.barber_id OR NEW.barber_name IS NULL) THEN
    SELECT name INTO NEW.barber_name FROM public.barbers WHERE id = NEW.barber_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.payments_set_barber_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_barber_name ON public.payments;
CREATE TRIGGER payments_barber_name
BEFORE INSERT OR UPDATE OF barber_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_set_barber_name();
