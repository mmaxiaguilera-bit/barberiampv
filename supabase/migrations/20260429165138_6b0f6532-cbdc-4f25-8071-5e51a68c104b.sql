-- Enum for payment methods
CREATE TYPE public.payment_method AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'mercadopago', 'otro');

-- Enum for expense categories
CREATE TYPE public.expense_category AS ENUM ('insumos', 'sueldos', 'alquiler', 'servicios', 'otros');

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  service_name TEXT NOT NULL,
  client_name TEXT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  tip NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (tip >= 0),
  payment_method public.payment_method NOT NULL DEFAULT 'efectivo',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_date ON public.payments(payment_date);
CREATE INDEX idx_payments_barber_date ON public.payments(barber_id, payment_date);
CREATE INDEX idx_payments_appointment ON public.payments(appointment_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all payments" ON public.payments
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Barbers view own payments" ON public.payments
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = payments.barber_id AND b.user_id = auth.uid()));

CREATE POLICY "Barbers create own payments" ON public.payments
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = payments.barber_id AND b.user_id = auth.uid()));

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL,
  category public.expense_category NOT NULL DEFAULT 'otros',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage expenses" ON public.expenses
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Barbers view expenses" ON public.expenses
  FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'barber'));

-- ============ CASH CLOSURES ============
CREATE TABLE public.cash_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closure_date DATE NOT NULL UNIQUE,
  total_income NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_tips NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
  income_by_method JSONB NOT NULL DEFAULT '{}'::jsonb,
  appointments_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  closed_by UUID,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_closures_date ON public.cash_closures(closure_date);

ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cash closures" ON public.cash_closures
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Barbers view cash closures" ON public.cash_closures
  FOR SELECT TO public
  USING (public.has_role(auth.uid(), 'barber'));