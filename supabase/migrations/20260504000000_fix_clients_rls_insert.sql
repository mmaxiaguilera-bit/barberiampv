-- Fix: anon no tenía permiso de INSERT en clients.
-- RLS policies solas no alcanzan; se necesita también el GRANT a nivel de tabla.

GRANT INSERT ON public.clients TO anon;
GRANT INSERT ON public.clients TO authenticated;

-- Asegurar que la política de INSERT público existe y es correcta
DROP POLICY IF EXISTS "Anyone create client" ON public.clients;
CREATE POLICY "Anyone create client" ON public.clients
  FOR INSERT WITH CHECK (true);
