-- ============================================================================
-- NIXGOFOOD: Esquema del programa de fidelización por puntos
-- Ver docs/superpowers/specs/2026-09-09-fidelizacion-puntos-design.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    points_per_currency_unit NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (points_per_currency_unit >= 0),
    redemption_value_per_point NUMERIC(10,4) NOT NULL DEFAULT 0.01 CHECK (redemption_value_per_point >= 0),
    max_redeem_percent NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (max_redeem_percent >= 0 AND max_redeem_percent <= 100),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_balance INT NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    UNIQUE (business_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'earn_reversal')),
    points INT NOT NULL,
    balance_after INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_order_type
  ON public.loyalty_transactions(order_id, type) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_business_id ON public.loyalty_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_business_id ON public.loyalty_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_account ON public.loyalty_transactions(business_id, customer_id);

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- loyalty_programs: el dueno/admin del negocio lo lee y edita. Sin acceso anon.
CREATE POLICY loyalty_programs_select ON public.loyalty_programs
  FOR SELECT TO authenticated
  USING (business_id = public.current_user_business_id());

CREATE POLICY loyalty_programs_insert ON public.loyalty_programs
  FOR INSERT TO authenticated
  WITH CHECK (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'));

CREATE POLICY loyalty_programs_update ON public.loyalty_programs
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'))
  WITH CHECK (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'));

REVOKE ALL ON public.loyalty_programs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.loyalty_programs TO authenticated;

-- loyalty_accounts / loyalty_transactions: sin politicas para anon/authenticated
-- a proposito -- solo las funciones SECURITY DEFINER (Tasks 3-6), que corren
-- como el owner de la funcion y no pasan por RLS de sesion, pueden tocarlas.
REVOKE ALL ON public.loyalty_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.loyalty_transactions FROM PUBLIC, anon, authenticated;
