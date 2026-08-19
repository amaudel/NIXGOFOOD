-- =========================================================================
-- MIGRACIÓN DE SEGURIDAD MICRO-HARDENED FINAL PARA DESPACHO
-- Archivo: 20260818_order_dispatch_checks.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.order_dispatch_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_complete BOOLEAN DEFAULT false,
  packaging BOOLEAN DEFAULT false,
  beverages BOOLEAN DEFAULT false,
  extras BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT order_dispatch_checks_order_id_key UNIQUE (order_id)
);

-- Enable RLS
ALTER TABLE public.order_dispatch_checks ENABLE ROW LEVEL SECURITY;

-- Add to Realtime Publication (Safe IF NOT EXISTS handling)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'order_dispatch_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_dispatch_checks;
  END IF;
END $$;

-- 1. Helper Function: Verify Dispatch Permissions (Fully Qualified, Search Path Empty)
CREATE OR REPLACE FUNCTION public.current_user_can_dispatch()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.active = true
      AND p.role IN ('owner', 'admin', 'operator')
      AND p.business_id IS NOT NULL
  );
$$;

-- Revoke RPC execution from anon / public, Grant strictly to authenticated
REVOKE ALL ON FUNCTION public.current_user_can_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_dispatch() TO authenticated;

-- 2. Trigger Function: Immutability & Audit Fields (Invoker, Search Path Empty)
CREATE OR REPLACE FUNCTION public.set_dispatch_check_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
      RAISE EXCEPTION 'business_id is immutable';
    END IF;

    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'order_id is immutable';
    END IF;
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Revoke direct RPC execution of the trigger function to prevent RPC endpoint exploitation
REVOKE ALL ON FUNCTION public.set_dispatch_check_audit_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_dispatch_check_audit ON public.order_dispatch_checks;
CREATE TRIGGER trg_set_dispatch_check_audit
BEFORE INSERT OR UPDATE ON public.order_dispatch_checks
FOR EACH ROW
EXECUTE FUNCTION public.set_dispatch_check_audit_fields();

-- Revoke all table permissions from anon / public
REVOKE ALL ON public.order_dispatch_checks FROM PUBLIC, anon;

-- 3. SELECT Policy: User must current_user_can_dispatch AND belong to current business_id
DROP POLICY IF EXISTS "Dispatch checks SELECT policy" ON public.order_dispatch_checks;
CREATE POLICY "Dispatch checks SELECT policy" ON public.order_dispatch_checks
FOR SELECT TO authenticated
USING (
  public.current_user_can_dispatch()
  AND business_id = public.current_user_business_id()
);

-- 4. INSERT Policy: User must current_user_can_dispatch AND own order_id within business
DROP POLICY IF EXISTS "Dispatch checks INSERT policy" ON public.order_dispatch_checks;
CREATE POLICY "Dispatch checks INSERT policy" ON public.order_dispatch_checks
FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_can_dispatch()
  AND business_id = public.current_user_business_id()
  AND order_id IN (
    SELECT id FROM public.orders WHERE business_id = public.current_user_business_id()
  )
);

-- 5. UPDATE Policy: User must current_user_can_dispatch AND maintain business_id & order_id continuity
DROP POLICY IF EXISTS "Dispatch checks UPDATE policy" ON public.order_dispatch_checks;
CREATE POLICY "Dispatch checks UPDATE policy" ON public.order_dispatch_checks
FOR UPDATE TO authenticated
USING (
  public.current_user_can_dispatch()
  AND business_id = public.current_user_business_id()
)
WITH CHECK (
  public.current_user_can_dispatch()
  AND business_id = public.current_user_business_id()
  AND order_id IN (
    SELECT id FROM public.orders WHERE business_id = public.current_user_business_id()
  )
);

-- Grant DML strictly to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.order_dispatch_checks TO authenticated;
