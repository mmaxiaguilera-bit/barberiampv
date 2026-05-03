-- Tabla de solicitudes de acceso: usuarios sin rol pueden pedir acceso al admin
CREATE TABLE public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- El usuario ve su propia solicitud; el admin ve todas
CREATE POLICY "Select access_requests" ON public.access_requests FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- El usuario puede insertar su propia solicitud
CREATE POLICY "Insert own access_request" ON public.access_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Solo admins pueden actualizar (aprobar/rechazar)
CREATE POLICY "Admins update access_requests" ON public.access_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));
