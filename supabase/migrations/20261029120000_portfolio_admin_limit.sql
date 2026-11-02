-- =====================================================================
-- PORTFOLIO: el admin también gestiona las fotos y máximo 6 por barbero
-- =====================================================================
-- * El admin puede subir, editar y borrar las fotos (y la foto de perfil)
--   de cualquier barbero desde Admin → Barberos.
-- * Cada barbero tiene como máximo 6 fotos de cortes (la foto de perfil no cuenta).

-- ---------------------------------------------------------------------
-- 1. Permiso: el propio barbero o un admin
-- ---------------------------------------------------------------------
-- Las políticas de barber_portfolio y storage ya usan esta función
CREATE OR REPLACE FUNCTION public.can_manage_barber(_barber_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.barbers WHERE id = _barber_id AND user_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Tope de 6 fotos por barbero
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_portfolio_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Bloquea al barbero para que dos subidas simultáneas no pasen el tope
  PERFORM 1 FROM public.barbers WHERE id = NEW.barber_id FOR UPDATE;
  IF (SELECT count(*) FROM public.barber_portfolio WHERE barber_id = NEW.barber_id) >= 6 THEN
    RAISE EXCEPTION 'Máximo 6 fotos por barbero. Borrá una para subir otra.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS barber_portfolio_limit ON public.barber_portfolio;
CREATE TRIGGER barber_portfolio_limit
BEFORE INSERT ON public.barber_portfolio
FOR EACH ROW EXECUTE FUNCTION public.enforce_portfolio_limit();

-- ---------------------------------------------------------------------
-- 3. Foto de perfil de un barbero (el propio barbero o un admin)
-- ---------------------------------------------------------------------
-- Solo acepta una URL pública de la carpeta de ese barbero; NULL la quita.
CREATE OR REPLACE FUNCTION public.set_barber_photo(_barber_id UUID, _photo_url TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_barber(_barber_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _photo_url IS NOT NULL
     AND position('/storage/v1/object/public/barber-portfolio/' || _barber_id::text || '/' IN _photo_url) = 0 THEN
    RAISE EXCEPTION 'invalid_photo' USING ERRCODE = '22023';
  END IF;
  UPDATE public.barbers SET photo_url = _photo_url WHERE id = _barber_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_barber_photo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_barber_photo(UUID, TEXT) TO authenticated;
