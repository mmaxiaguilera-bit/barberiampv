-- =====================================================================
-- PORTFOLIO DE BARBEROS: página pública por barbero con sus mejores cortes
-- =====================================================================
-- * Cada barbero tiene un slug para su URL pública (/barberos/<slug>).
-- * Las fotos viven en el bucket público "barber-portfolio", en la carpeta
--   <barber_id>/. Las sube y borra cada barbero desde su cuenta (solo las suyas).
-- * Cualquiera puede verlas (son para mostrar en la web).

-- ---------------------------------------------------------------------
-- 1. Slug del barbero
-- ---------------------------------------------------------------------
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.slugify(_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(
    translate(lower(coalesce(_text, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- Genera un slug único a partir del nombre si no se cargó uno
CREATE OR REPLACE FUNCTION public.set_barber_slug()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_n INT := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    NEW.slug := public.slugify(NEW.slug);
    RETURN NEW;
  END IF;
  v_base := NULLIF(public.slugify(NEW.name), '');
  v_base := COALESCE(v_base, 'barbero');
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.barbers WHERE slug = v_slug AND id <> NEW.id) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  NEW.slug := v_slug;
  RETURN NEW;
END; $$;

CREATE TRIGGER barbers_set_slug
BEFORE INSERT OR UPDATE OF slug ON public.barbers
FOR EACH ROW EXECUTE FUNCTION public.set_barber_slug();

-- Completar los barberos existentes (dispara el trigger)
UPDATE public.barbers SET slug = NULL WHERE slug IS NULL;

-- ---------------------------------------------------------------------
-- 2. Fotos del portfolio
-- ---------------------------------------------------------------------
CREATE TABLE public.barber_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL UNIQUE,
  caption TEXT CHECK (caption IS NULL OR length(caption) <= 120),
  display_order INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La foto tiene que estar en la carpeta del barbero
  CONSTRAINT barber_portfolio_path CHECK (image_path LIKE barber_id::text || '/%')
);
CREATE INDEX barber_portfolio_barber_idx ON public.barber_portfolio (barber_id, display_order, created_at DESC);

-- Solo el propio barbero administra sus fotos
CREATE OR REPLACE FUNCTION public.can_manage_barber(_barber_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers WHERE id = _barber_id AND user_id = auth.uid() AND auth.uid() IS NOT NULL)
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_barber(UUID) TO anon, authenticated;

ALTER TABLE public.barber_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view portfolio" ON public.barber_portfolio FOR SELECT USING (true);
CREATE POLICY "Own barber insert portfolio" ON public.barber_portfolio FOR INSERT
  WITH CHECK (public.can_manage_barber(barber_id));
CREATE POLICY "Own barber update portfolio" ON public.barber_portfolio FOR UPDATE
  USING (public.can_manage_barber(barber_id)) WITH CHECK (public.can_manage_barber(barber_id));
CREATE POLICY "Own barber delete portfolio" ON public.barber_portfolio FOR DELETE
  USING (public.can_manage_barber(barber_id));

-- ---------------------------------------------------------------------
-- 3. Almacenamiento de imágenes
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('barber-portfolio', 'barber-portfolio', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Carpeta = id del barbero. Las fotos son públicas; la política de lectura
-- además hace falta para reemplazar archivos (upsert).
CREATE POLICY "Portfolio public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'barber-portfolio');
CREATE POLICY "Portfolio upload by own barber" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'barber-portfolio'
              AND public.can_manage_barber(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Portfolio update by own barber" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'barber-portfolio'
         AND public.can_manage_barber(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Portfolio delete by own barber" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'barber-portfolio'
         AND public.can_manage_barber(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- 4. Foto de perfil: la cambia el propio barbero (barbers solo lo edita el admin)
-- ---------------------------------------------------------------------
-- Solo acepta una URL pública de su propia carpeta del bucket; NULL la quita.
CREATE OR REPLACE FUNCTION public.set_my_barber_photo(_photo_url TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.barbers WHERE user_id = auth.uid() AND auth.uid() IS NOT NULL;
  IF v_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _photo_url IS NOT NULL
     AND position('/storage/v1/object/public/barber-portfolio/' || v_id::text || '/' IN _photo_url) = 0 THEN
    RAISE EXCEPTION 'invalid_photo' USING ERRCODE = '22023';
  END IF;
  UPDATE public.barbers SET photo_url = _photo_url WHERE id = v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_my_barber_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_barber_photo(TEXT) TO authenticated;
