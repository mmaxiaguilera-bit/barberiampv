-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'barber');
CREATE TYPE public.appointment_status AS ENUM ('pendiente', 'confirmado', 'atendido', 'cancelado');

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================
-- BARBERS
-- =========================
CREATE TABLE public.barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;

-- =========================
-- SERVICES
-- =========================
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 45,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- =========================
-- SCHEDULES (per barber, weekly)
-- =========================
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun..6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL DEFAULT 45,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (barber_id, day_of_week)
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- =========================
-- APPOINTMENTS
-- =========================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  service_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pendiente',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Prevent double booking (only for active appointments)
CREATE UNIQUE INDEX appointments_no_double_booking
ON public.appointments (barber_id, appointment_date, appointment_time)
WHERE status <> 'cancelado';

CREATE INDEX appointments_barber_date_idx ON public.appointments (barber_id, appointment_date);
CREATE INDEX appointments_date_idx ON public.appointments (appointment_date);

-- =========================
-- TRIGGERS
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER set_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- RLS POLICIES
-- =========================

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- barbers (public read)
CREATE POLICY "Anyone view active barbers" ON public.barbers FOR SELECT USING (true);
CREATE POLICY "Admins manage barbers" ON public.barbers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- services (public read)
CREATE POLICY "Anyone view services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Admins manage services" ON public.services FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- schedules (public read needed for booking)
CREATE POLICY "Anyone view schedules" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Admins manage schedules" ON public.schedules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Barbers manage own schedules" ON public.schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = schedules.barber_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = schedules.barber_id AND b.user_id = auth.uid()));

-- appointments
-- Anyone (incl anonymous) can create a booking
CREATE POLICY "Anyone create appointment" ON public.appointments FOR INSERT WITH CHECK (true);
-- Public can read only basic occupancy info (date+time+barber) — but RLS is row-level, so we expose minimal cols via view? simplest: allow read of taken slots only via SECURITY DEFINER fn (below). For RLS on table, restrict SELECT to staff.
CREATE POLICY "Admins view all appointments" ON public.appointments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Barbers view own appointments" ON public.appointments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid()));
CREATE POLICY "Admins update appointments" ON public.appointments FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Barbers update own appointments" ON public.appointments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid()));
CREATE POLICY "Admins delete appointments" ON public.appointments FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================
-- PUBLIC FUNCTION: get taken slots (no PII exposed)
-- =========================
CREATE OR REPLACE FUNCTION public.get_taken_slots(_barber_id UUID, _date DATE)
RETURNS TABLE (appointment_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT appointment_time
  FROM public.appointments
  WHERE barber_id = _barber_id
    AND appointment_date = _date
    AND status <> 'cancelado'
$$;
GRANT EXECUTE ON FUNCTION public.get_taken_slots(UUID, DATE) TO anon, authenticated;

-- =========================
-- ADMIN HELPER: bootstrap first admin
-- (an authenticated user with no admin yet can claim the first admin role)
-- =========================
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_any_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_any_admin;
  IF has_any_admin THEN RETURN FALSE; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin');
  RETURN TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;
