-- ============================================================================
-- NIXGOFOOD: columnas de fidelizacion en orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS points_redeemed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_earned INT NOT NULL DEFAULT 0;
