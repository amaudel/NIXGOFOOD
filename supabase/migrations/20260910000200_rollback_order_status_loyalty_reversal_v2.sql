-- ============================================================================
-- NIXGOFOOD: rollback_order_status -- reversa de puntos sin depender del
-- indice unico eliminado
--
-- Base: cuerpo verificado de 20260909100500_rollback_order_status_loyalty_reversal.sql.
-- Cambios de esta migracion:
--
-- 1. Ya no se usa ON CONFLICT (order_id, type) -- ese indice unico se
--    elimino en 20260910000000_loyalty_transactions_relax_idempotency.sql.
--    La proteccion real es el CAS de mas arriba (UPDATE ... WHERE status =
--    p_expected_status): un reintento nunca llega a este bloque porque el
--    estado ya cambio.
-- 2. Como ahora un mismo pedido puede tener MAS de una fila 'earn' en el
--    ledger (si se reabre y reentrega mas de una vez), la busqueda de
--    "cuantos puntos hay que revertir" toma la fila 'earn' MAS RECIENTE
--    (ORDER BY created_at DESC LIMIT 1) -- es la que corresponde al ciclo de
--    entrega que se esta reabriendo ahora, no una entrega anterior ya
--    revertida.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rollback_order_status(
  p_order_id UUID,
  p_expected_status TEXT,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_user_name TEXT;
  v_business_id UUID;
  v_current_db_status TEXT;
  v_updated_rows INT;
  -- Fidelizacion
  v_customer_id UUID;
  v_earn_points INT;
  v_reversal_points INT;
  v_loyalty_account_id UUID;
BEGIN
  IF p_order_id IS NULL OR p_expected_status IS NULL OR p_target_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: p_order_id, p_expected_status y p_target_status son obligatorios.';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para revertir pedido.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: No tienes un perfil administrativo activo asignado a un negocio.';
  END IF;

  IF p_expected_status = 'preparing' AND p_target_status = 'new' THEN
    -- OK
  ELSIF p_expected_status = 'ready' AND p_target_status = 'preparing' THEN
    -- OK
  ELSIF p_expected_status = 'on_the_way' AND p_target_status = 'ready' THEN
    -- OK
  ELSIF p_expected_status = 'delivered' AND p_target_status = 'on_the_way' THEN
    IF v_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Solo administradores o propietarios pueden reabrir pedidos entregados.';
    END IF;
    IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para reabrir pedido entregado.';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_BACKWARDS_TRANSITION: Transición de retroceso no permitida (% -> %).', p_expected_status, p_target_status;
  END IF;

  UPDATE public.orders
  SET status = p_target_status,
      updated_at = pg_catalog.now()
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

    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'CONCURRENCY_CONFLICT',
      'message', 'El pedido cambió de estado desde otro dispositivo.',
      'current_status', v_current_db_status
    );
  END IF;

  INSERT INTO public.order_status_history (
    business_id, order_id, from_status, to_status, changed_by, changed_by_name, reason, is_rollback, created_at
  ) VALUES (
    v_business_id, p_order_id, p_expected_status, p_target_status, v_user_id,
    COALESCE(v_user_name, 'Administrador'), COALESCE(p_reason, 'Retroceso de estado'), true, pg_catalog.now()
  );

  -- ==========================================================================
  -- Fidelizacion: si se revierte un pedido entregado, reversar los puntos que
  -- se le habian acreditado EN ESTE CICLO (la fila 'earn' mas reciente).
  -- Sin ON CONFLICT: la proteccion es el CAS de arriba. Si por algun motivo
  -- el cliente ya gasto esos puntos en otro pedido, el balance se clampa a 0
  -- en vez de quedar negativo (violaria el CHECK points_balance >= 0) -- el
  -- MISMO numero clampeado se usa en el ledger y en el balance para que
  -- balance siga siendo exactamente la suma del ledger.
  -- orders.customer_id es nullable (ON DELETE SET NULL): se guarda con
  -- v_customer_id IS NOT NULL antes de tocar loyalty_accounts/loyalty_transactions
  -- (ambas NOT NULL en customer_id), igual que en transition_order_status.
  -- ==========================================================================
  IF p_expected_status = 'delivered' AND p_target_status = 'on_the_way' THEN
    SELECT customer_id INTO v_customer_id FROM public.orders WHERE id = p_order_id;

    SELECT points INTO v_earn_points
    FROM public.loyalty_transactions
    WHERE order_id = p_order_id AND type = 'earn'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_earn_points IS NOT NULL AND v_earn_points > 0 AND v_customer_id IS NOT NULL THEN
      SELECT id INTO v_loyalty_account_id
      FROM public.loyalty_accounts
      WHERE business_id = v_business_id AND customer_id = v_customer_id
      FOR UPDATE;

      IF v_loyalty_account_id IS NOT NULL THEN
        SELECT LEAST(v_earn_points, points_balance) INTO v_reversal_points
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id;

        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        SELECT v_business_id, v_customer_id, p_order_id, 'earn_reversal', -v_reversal_points, points_balance - v_reversal_points
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id;

        UPDATE public.loyalty_accounts
        SET points_balance = points_balance - v_reversal_points, updated_at = pg_catalog.now()
        WHERE id = v_loyalty_account_id;

        UPDATE public.orders SET points_earned = 0 WHERE id = p_order_id;
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'from_status', p_expected_status,
    'to_status', p_target_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_order_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollback_order_status(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_order_status(UUID, TEXT, TEXT, TEXT) TO authenticated;
