-- Tabla de clientes
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_phone ON public.clients (phone);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede crear un cliente (necesario para el booking público)
CREATE POLICY "Anyone create client" ON public.clients FOR INSERT WITH CHECK (true);

-- Solo staff puede leer
CREATE POLICY "Staff view clients" ON public.clients FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'barber'));

-- Admin puede actualizar y eliminar
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Función pública para buscar cliente por teléfono (sin exponer PII a anon)
CREATE OR REPLACE FUNCTION public.get_client_by_phone(_phone TEXT)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT, birth_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, first_name, last_name, birth_date
  FROM public.clients
  WHERE phone = _phone
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_client_by_phone(TEXT) TO anon, authenticated;

-- Agregar client_id a appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_client ON public.appointments (client_id);
