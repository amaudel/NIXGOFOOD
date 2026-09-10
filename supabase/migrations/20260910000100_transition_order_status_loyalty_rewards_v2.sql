-- ============================================================================
-- NIXGOFOOD: transition_order_status -- reembolso de puntos al cancelar +
-- acreditacion re-entrante tras reabrir un pedido
--
-- Base: cuerpo verificado de 20260909100400_transition_order_status_loyalty_earn.sql
-- (ya construido sobre la version endurecida sin el backdoor de
-- auto-provisioning). Cambios de esta migracion:
--
-- 1. El SELECT inicial ahora tambien trae points_earned y points_redeemed
--    del pedido (estado ANTES de esta transicion).
-- 2. El bloque de acreditacion ('delivered') ya NO depende de
--    ON CONFLICT (order_id, type) -- ese indice unico se elimino en
--    20260910000000_loyalty_transactions_relax_idempotency.sql. La
--    proteccion real contra duplicados es el propio UPDATE ... WHERE status
--    = v_expected_status de mas arriba (CAS): un reintento nunca llega a
--    este bloque porque el estado ya cambio. En su lugar, el bloque se
--    guarda contra volver a acreditar DENTRO del mismo ciclo de entrega
--    chequeando que points_earned este en 0 antes de acreditar -- lo que
--    permite que un pedido reabierto y reentregado de verdad vuelva a
--    ganar puntos (points_earned se resetea a 0 en la reversa de
--    rollback_order_status).
-- 3. Nuevo bloque: cuando la transicion es a 'cancelled' y el pedido habia
--    canjeado puntos (points_redeemed > 0), se le devuelven al cliente via
--    una transaccion 'redeem_reversal'. Decision de producto: cancelar un
--    pedido no debe dejarle al cliente sin el pedido Y sin los puntos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id UUID,
  p_action TEXT,
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
  v_expected_status TEXT;
  v_target_status TEXT;
  v_current_db_status TEXT;
  v_delivery_method TEXT;
  v_payment_method TEXT;
  v_transfer_details JSONB;
  v_verification_status TEXT;
  v_requires_drinks BOOLEAN;
  v_requires_extras BOOLEAN;
  v_dispatch_checks RECORD;
  v_updated_rows INT;
  -- Fidelizacion
  v_customer_id UUID;
  v_subtotal NUMERIC(10,2);
  v_discount_total NUMERIC(10,2);
  v_order_points_earned_before INT;
  v_order_points_redeemed_before INT;
  v_loyalty_enabled BOOLEAN;
  v_points_per_unit NUMERIC(10,4);
  v_points_earned INT;
  v_loyalty_account_id UUID;
BEGIN
  IF p_order_id IS NULL OR p_action IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: Los parámetros p_order_id y p_action son obligatorios.';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para cambiar el estado del pedido.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: No tienes un perfil administrativo activo asignado a un negocio.';
  END IF;

  SELECT status, delivery_method, payment_method, transfer_details, customer_id, subtotal, discount_total, points_earned, points_redeemed
  INTO v_current_db_status, v_delivery_method, v_payment_method, v_transfer_details, v_customer_id, v_subtotal, v_discount_total, v_order_points_earned_before, v_order_points_redeemed_before
  FROM public.orders
  WHERE id = p_order_id AND business_id = v_business_id;

  IF v_current_db_status IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido no existe o pertenece a otro negocio.';
  END IF;

  CASE p_action
    WHEN 'KITCHEN_START' THEN
      v_expected_status := 'new';
      v_target_status := 'preparing';

      v_verification_status := COALESCE(v_transfer_details->>'verificationStatus', 'pending');
      IF v_payment_method <> 'cash' AND v_verification_status <> 'verified' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: No se puede empezar la preparación de un pedido con pago por transferencia sin verificar.';
      END IF;

    WHEN 'KITCHEN_READY' THEN
      v_expected_status := 'preparing';
      v_target_status := 'ready';

    WHEN 'DISPATCH_DELIVERY' THEN
      v_expected_status := 'ready';
      v_target_status := 'on_the_way';

      IF v_delivery_method <> 'delivery' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con entrega a domicilio (Delivery).';
      END IF;

      v_verification_status := COALESCE(v_transfer_details->>'verificationStatus', 'pending');
      IF v_payment_method <> 'cash' AND v_verification_status <> 'verified' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.';
      END IF;

      SELECT * INTO v_dispatch_checks
      FROM public.order_dispatch_checks
      WHERE order_id = p_order_id AND business_id = v_business_id;

      IF v_dispatch_checks IS NULL OR NOT COALESCE(v_dispatch_checks.order_complete, false) OR NOT COALESCE(v_dispatch_checks.packaging, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: El empaque y la verificación del pedido deben estar marcados en Despacho.';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id
          AND (pg_catalog.lower(COALESCE(product_name_snapshot, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)'
               OR pg_catalog.lower(COALESCE(notes, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)')
      ) INTO v_requires_drinks;

      IF v_requires_drinks AND NOT COALESCE(v_dispatch_checks.beverages, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene bebidas que deben ser verificadas en Despacho.';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.order_item_modifiers oim
        JOIN public.order_items oi ON oi.id = oim.order_item_id
        WHERE oi.order_id = p_order_id
      ) INTO v_requires_extras;

      IF v_requires_extras AND NOT COALESCE(v_dispatch_checks.extras, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene extras que deben ser verificados en Despacho.';
      END IF;

    WHEN 'DISPATCH_PICKUP' THEN
      v_expected_status := 'ready';
      v_target_status := 'delivered';

      IF v_delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con retiro en local (Pickup).';
      END IF;

      v_verification_status := COALESCE(v_transfer_details->>'verificationStatus', 'pending');
      IF v_payment_method <> 'cash' AND v_verification_status <> 'verified' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.';
      END IF;

      SELECT * INTO v_dispatch_checks
      FROM public.order_dispatch_checks
      WHERE order_id = p_order_id AND business_id = v_business_id;

      IF v_dispatch_checks IS NULL OR NOT COALESCE(v_dispatch_checks.order_complete, false) OR NOT COALESCE(v_dispatch_checks.packaging, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: El empaque y la verificación del pedido deben estar marcados en Despacho.';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id
          AND (pg_catalog.lower(COALESCE(product_name_snapshot, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)'
               OR pg_catalog.lower(COALESCE(notes, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)')
      ) INTO v_requires_drinks;

      IF v_requires_drinks AND NOT COALESCE(v_dispatch_checks.beverages, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene bebidas que deben ser verificadas en Despacho.';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.order_item_modifiers oim
        JOIN public.order_items oi ON oi.id = oim.order_item_id
        WHERE oi.order_id = p_order_id
      ) INTO v_requires_extras;

      IF v_requires_extras AND NOT COALESCE(v_dispatch_checks.extras, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene extras que deben ser verificados en Despacho.';
      END IF;

    WHEN 'DISPATCH_CONFIRM_DELIVERY' THEN
      v_expected_status := 'on_the_way';
      v_target_status := 'delivered';

      IF v_delivery_method <> 'delivery' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_METHOD: Confirmación de entrega aplica únicamente a pedidos con Delivery.';
      END IF;

    WHEN 'ADMIN_CANCEL' THEN
      IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Solo propietarios o administradores pueden cancelar pedidos.';
      END IF;

      IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para cancelar el pedido.';
      END IF;

      IF v_current_db_status IN ('delivered', 'cancelled') THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Un pedido entregado o cancelado no se puede cancelar.';
      END IF;

      v_expected_status := v_current_db_status;
      v_target_status := 'cancelled';

    ELSE
      RAISE EXCEPTION 'UNKNOWN_ACTION: Acción de pedido desconocida: %', p_action;
  END CASE;

  IF v_current_db_status <> v_expected_status THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: La acción % no está permitida desde el estado actual (%).', p_action, v_current_db_status;
  END IF;

  UPDATE public.orders
  SET status = v_target_status,
      updated_at = pg_catalog.now()
  WHERE id = p_order_id
    AND business_id = v_business_id
    AND status = v_expected_status;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
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
    v_business_id, p_order_id, v_expected_status, v_target_status, v_user_id,
    COALESCE(v_user_name, 'Operador'), COALESCE(p_reason, 'Acción ' || p_action), false, pg_catalog.now()
  );

  -- ==========================================================================
  -- Fidelizacion: acreditar puntos ganados solo al llegar a 'delivered'.
  -- Sin ON CONFLICT: la proteccion contra duplicados es el CAS de arriba (un
  -- reintento nunca llega hasta aca). El guard points_earned = 0 es lo que
  -- permite re-acreditar tras un ciclo reabrir->reentregar real.
  -- ==========================================================================
  IF v_target_status = 'delivered' THEN
    SELECT enabled, points_per_currency_unit INTO v_loyalty_enabled, v_points_per_unit
    FROM public.loyalty_programs WHERE business_id = v_business_id;

    IF v_loyalty_enabled IS TRUE THEN
      v_points_earned := pg_catalog.floor(GREATEST(v_subtotal - COALESCE(v_discount_total, 0), 0) * v_points_per_unit)::INT;

      IF v_points_earned > 0 AND v_customer_id IS NOT NULL AND COALESCE(v_order_points_earned_before, 0) = 0 THEN
        SELECT id INTO v_loyalty_account_id
        FROM public.loyalty_accounts
        WHERE business_id = v_business_id AND customer_id = v_customer_id
        FOR UPDATE;

        IF v_loyalty_account_id IS NULL THEN
          INSERT INTO public.loyalty_accounts (business_id, customer_id, points_balance)
          VALUES (v_business_id, v_customer_id, 0)
          ON CONFLICT (business_id, customer_id) DO UPDATE SET updated_at = pg_catalog.now()
          RETURNING id INTO v_loyalty_account_id;
        END IF;

        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        SELECT v_business_id, v_customer_id, p_order_id, 'earn', v_points_earned, points_balance + v_points_earned
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id;

        UPDATE public.loyalty_accounts
        SET points_balance = points_balance + v_points_earned, updated_at = pg_catalog.now()
        WHERE id = v_loyalty_account_id;

        UPDATE public.orders SET points_earned = v_points_earned WHERE id = p_order_id;
      END IF;
    END IF;
  END IF;

  -- ==========================================================================
  -- Fidelizacion: devolver puntos canjeados si el negocio cancela el pedido.
  -- Decision de producto: el cliente no se queda sin el pedido Y sin los
  -- puntos. Sin ON CONFLICT por el mismo motivo que arriba -- ADMIN_CANCEL
  -- ya es rechazado explicitamente si el pedido esta 'cancelled' o
  -- 'delivered' (mas arriba en el CASE), asi que nunca se ejecuta dos veces
  -- para el mismo pedido.
  -- ==========================================================================
  IF v_target_status = 'cancelled' THEN
    IF COALESCE(v_order_points_redeemed_before, 0) > 0 AND v_customer_id IS NOT NULL THEN
      SELECT id INTO v_loyalty_account_id
      FROM public.loyalty_accounts
      WHERE business_id = v_business_id AND customer_id = v_customer_id
      FOR UPDATE;

      IF v_loyalty_account_id IS NOT NULL THEN
        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        SELECT v_business_id, v_customer_id, p_order_id, 'redeem_reversal', v_order_points_redeemed_before, points_balance + v_order_points_redeemed_before
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id;

        UPDATE public.loyalty_accounts
        SET points_balance = points_balance + v_order_points_redeemed_before, updated_at = pg_catalog.now()
        WHERE id = v_loyalty_account_id;

        UPDATE public.orders SET points_redeemed = 0 WHERE id = p_order_id;
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'action', p_action,
    'from_status', v_expected_status,
    'to_status', v_target_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) TO authenticated;
