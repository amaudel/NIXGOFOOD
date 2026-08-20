-- ============================================================================
-- NIXGOFOOD: RPC transition_order_status
-- Description: The version of this function currently live in production is
--   stale (predates DISPATCH_PICKUP as a valid action and references an old
--   order_dispatch_checks.drinks_verified column instead of the current
--   .beverages), causing "UNKNOWN_ACTION: DISPATCH_PICKUP" and
--   "column drinks_verified does not exist" when dispatch tries to hand off
--   or deliver an order. CREATE OR REPLACE overwrites it with the current,
--   correct definition (verified against production_baseline.sql's schema),
--   including the KITCHEN_START payment-verification guard added alongside
--   the payment-verification fixes. public.orders has UPDATE revoked from
--   anon/authenticated, so this SECURITY DEFINER function is the only path
--   Kitchen/Dispatch/Cancel actions can use to change order status.
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
BEGIN
  -- Validar parámetros nulos obligatorios
  IF p_order_id IS NULL OR p_action IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: Los parámetros p_order_id y p_action son obligatorios.';
  END IF;

  -- A. Autenticación e Identidad del usuario servidor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para cambiar el estado del pedido.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  -- Auto-vincular perfil para entorno dev/admin si business_id es nulo
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

  -- B. Consultar pedido actual y validar pertenencia al negocio del usuario
  SELECT status, delivery_method, payment_method, transfer_details
  INTO v_current_db_status, v_delivery_method, v_payment_method, v_transfer_details
  FROM public.orders
  WHERE id = p_order_id AND business_id = v_business_id;

  IF v_current_db_status IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido no existe o pertenece a otro negocio.';
  END IF;

  -- C. Matriz Server-Side de Acciones & Validaciones Específicas
  CASE p_action
    WHEN 'KITCHEN_START' THEN
      v_expected_status := 'new';
      v_target_status := 'preparing';

      -- Pago
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

      -- Modalidad
      IF v_delivery_method <> 'delivery' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con entrega a domicilio (Delivery).';
      END IF;

      -- Pago
      v_verification_status := COALESCE(v_transfer_details->>'verificationStatus', 'pending');
      IF v_payment_method <> 'cash' AND v_verification_status <> 'verified' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.';
      END IF;

      -- Checklist
      SELECT * INTO v_dispatch_checks
      FROM public.order_dispatch_checks
      WHERE order_id = p_order_id AND business_id = v_business_id;

      IF v_dispatch_checks IS NULL OR NOT COALESCE(v_dispatch_checks.order_complete, false) OR NOT COALESCE(v_dispatch_checks.packaging, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: El empaque y la verificación del pedido deben estar marcados en Despacho.';
      END IF;

      -- Bebidas requeridas?
      SELECT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id
          AND (pg_catalog.lower(COALESCE(product_name_snapshot, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)'
               OR pg_catalog.lower(COALESCE(notes, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)')
      ) INTO v_requires_drinks;

      IF v_requires_drinks AND NOT COALESCE(v_dispatch_checks.beverages, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene bebidas que deben ser verificadas en Despacho.';
      END IF;

      -- Extras requeridos?
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

      -- Modalidad
      IF v_delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con retiro en local (Pickup).';
      END IF;

      -- Pago
      v_verification_status := COALESCE(v_transfer_details->>'verificationStatus', 'pending');
      IF v_payment_method <> 'cash' AND v_verification_status <> 'verified' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.';
      END IF;

      -- Checklist
      SELECT * INTO v_dispatch_checks
      FROM public.order_dispatch_checks
      WHERE order_id = p_order_id AND business_id = v_business_id;

      IF v_dispatch_checks IS NULL OR NOT COALESCE(v_dispatch_checks.order_complete, false) OR NOT COALESCE(v_dispatch_checks.packaging, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: El empaque y la verificación del pedido deben estar marcados en Despacho.';
      END IF;

      -- Bebidas requeridas?
      SELECT EXISTS (
        SELECT 1 FROM public.order_items
        WHERE order_id = p_order_id
          AND (pg_catalog.lower(COALESCE(product_name_snapshot, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)'
               OR pg_catalog.lower(COALESCE(notes, '')) ~* '(agua|horchata|limonada|menta|coca|cola|bebida|jugo|gaseosa|soda|500ml|1l|lata|botella|té)')
      ) INTO v_requires_drinks;

      IF v_requires_drinks AND NOT COALESCE(v_dispatch_checks.beverages, false) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Este pedido contiene bebidas que deben ser verificadas en Despacho.';
      END IF;

      -- Extras requeridos?
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

  -- Validar estado actual vs esperado
  IF v_current_db_status <> v_expected_status THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: La acción % no está permitida desde el estado actual (%).', p_action, v_current_db_status;
  END IF;

  -- D. Compare-And-Swap (CAS) Update en orders
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

  -- E. Registro Atómico en la Bitácora de Historial (Misma transacción)
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
    v_expected_status,
    v_target_status,
    v_user_id,
    COALESCE(v_user_name, 'Operador'),
    COALESCE(p_reason, 'Acción ' || p_action),
    false,
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'action', p_action,
    'from_status', v_expected_status,
    'to_status', v_target_status
  );
END;
$$;

-- Restringir permisos de ejecución de la RPC exclusivamente a usuarios autenticados
REVOKE ALL ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, TEXT) TO authenticated;
