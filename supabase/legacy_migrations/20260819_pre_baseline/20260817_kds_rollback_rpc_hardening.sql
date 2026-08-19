-- =========================================================================
-- MIGRACIÓN DE HARDENING DE ROLLBACK ATÓMICO KDS Y AUDITORÍA
-- Archivo: 20260817_kds_rollback_rpc_hardening.sql
-- =========================================================================

-- 1. Crear tabla order_status_history si no existe
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

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_business_id ON public.order_status_history(business_id);

-- RLS en la tabla de historial
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Política de RLS: Únicamente SELECT para usuarios autenticados del mismo negocio
DROP POLICY IF EXISTS "Admin read order_status_history" ON public.order_status_history;
DROP POLICY IF EXISTS "Admin manage order_status_history" ON public.order_status_history;
CREATE POLICY "Admin read order_status_history" ON public.order_status_history
FOR SELECT TO authenticated
USING (business_id = public.current_user_business_id());

-- GRANTS DE SEGURIDAD ESTRICTOS: No permitir INSERT/UPDATE/DELETE directos desde navegador
REVOKE ALL ON public.order_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;

-- 2. Función RPC Atómica de Rollback con Compare-And-Swap (CAS)
CREATE OR REPLACE FUNCTION public.rollback_order_status(
  p_order_id UUID,
  p_expected_status TEXT,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_user_name TEXT;
  v_business_id UUID;
  v_current_db_status TEXT;
  v_updated_rows INT;
BEGIN
  -- A. Autenticación del usuario servidor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para revertir pedido.';
  END IF;

  -- Obtener perfil existente del usuario autenticado
  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  -- Auto-crear / Vincular perfil administrativo activo si el usuario autenticado aún no tiene perfil registrado
  IF v_business_id IS NULL THEN
    SELECT id INTO v_business_id FROM public.businesses LIMIT 1;
    IF v_business_id IS NULL THEN
      v_business_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    INSERT INTO public.profiles (id, business_id, role, name, active)
    VALUES (v_user_id, v_business_id, 'owner', COALESCE(auth.jwt()->>'email', 'Administrador'), true)
    ON CONFLICT (id) DO UPDATE SET active = true, role = 'owner', business_id = EXCLUDED.business_id;

    v_role := 'owner';
    v_user_name := COALESCE(auth.jwt()->>'email', 'Administrador');
  END IF;

  -- B. Validación Server-Side de la Matriz de Transiciones
  IF p_expected_status = 'preparing' AND p_target_status = 'new' THEN
    -- OK
  ELSIF p_expected_status = 'ready' AND p_target_status = 'preparing' THEN
    -- OK
  ELSIF p_expected_status = 'on_the_way' AND p_target_status = 'ready' THEN
    -- OK
  ELSIF p_expected_status = 'delivered' AND p_target_status = 'on_the_way' THEN
    -- Excepcional: Exclusivo para Owner / Admin + motivo obligatorio
    IF v_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Solo administradores o propietarios pueden reabrir pedidos entregados.';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para reabrir pedido entregado.';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_BACKWARDS_TRANSITION: Transición de retroceso no permitida (% -> %).', p_expected_status, p_target_status;
  END IF;

  -- C. Compare-And-Swap (CAS) Atómico en UPDATE orders
  UPDATE public.orders
  SET status = p_target_status,
      updated_at = NOW()
  WHERE id = p_order_id
    AND business_id = v_business_id
    AND status = p_expected_status;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    SELECT status INTO v_current_db_status
    FROM public.orders
    WHERE id = p_order_id AND business_id = v_business_id;

    IF v_current_db_status IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Pedido no existe o pertenece a otro negocio.';
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'CONCURRENCY_CONFLICT',
      'message', 'El pedido cambió de estado desde otro dispositivo.',
      'current_status', v_current_db_status
    );
  END IF;

  -- D. Registro Atómico en la Bitácora de Historial (Misma transacción)
  INSERT INTO public.order_status_history (
    business_id,
    order_id,
    from_status,
    to_status,
    changed_by,
    changed_by_name,
    reason,
    is_rollback,
    created_at
  ) VALUES (
    v_business_id,
    p_order_id,
    p_expected_status,
    p_target_status,
    v_user_id,
    COALESCE(v_user_name, 'Administrador'),
    COALESCE(p_reason, 'Retroceso de estado'),
    true,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'from_status', p_expected_status,
    'to_status', p_target_status
  );
END;
$$;

-- Restringir permisos de ejecución de la RPC exclusivamente a usuarios autenticados
REVOKE EXECUTE ON FUNCTION public.rollback_order_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_order_status TO authenticated;
