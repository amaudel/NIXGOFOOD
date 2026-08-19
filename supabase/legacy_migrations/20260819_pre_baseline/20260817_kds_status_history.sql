-- =========================================================================
-- MIGRACIÓN DE AUDITORÍA Y HISTORIAL DE ESTADOS DE PEDIDOS (KDS UNDO/ROLLBACK)
-- Archivo: 20260817_kds_status_history.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  reason TEXT,
  is_rollback BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage order_status_history" ON public.order_status_history;
CREATE POLICY "Admin manage order_status_history" ON public.order_status_history
FOR ALL TO authenticated
USING (business_id = public.current_user_business_id());

GRANT SELECT, INSERT ON public.order_status_history TO public, anon, authenticated;
