-- Tabla de bloqueos por barbero
CREATE TABLE public.barber_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL,
  block_date date NOT NULL,
  start_time time NULL,
  end_time time NULL,
  reason text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barber_blocks_time_check CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX idx_barber_blocks_barber_date ON public.barber_blocks (barber_id, block_date);

ALTER TABLE public.barber_blocks ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer (necesario para que el booking público filtre)
CREATE POLICY "Anyone view blocks"
ON public.barber_blocks FOR SELECT
USING (true);

-- Admins gestionan todo
CREATE POLICY "Admins manage blocks"
ON public.barber_blocks FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Barberos gestionan solo sus propios bloqueos
CREATE POLICY "Barbers manage own blocks"
ON public.barber_blocks FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.barbers b
  WHERE b.id = barber_blocks.barber_id AND b.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.barbers b
  WHERE b.id = barber_blocks.barber_id AND b.user_id = auth.uid()
));

-- RPC para obtener rangos bloqueados de un barbero en una fecha
CREATE OR REPLACE FUNCTION public.get_blocked_ranges(_barber_id uuid, _date date)
RETURNS TABLE(start_time time, end_time time, full_day boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    start_time,
    end_time,
    (start_time IS NULL AND end_time IS NULL) AS full_day
  FROM public.barber_blocks
  WHERE barber_id = _barber_id AND block_date = _date
$$;