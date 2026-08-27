-- ============================================================================
-- NIXGOFOOD: ELIMINAR AUTO-PROVISIONING BACKDOOR EN RPCs SECURITY DEFINER
-- Vulnerabilidad critica: transition_order_status y rollback_order_status
-- (ambas SECURITY DEFINER, unico camino de escritura sobre orders porque
-- UPDATE esta revocado del cliente) contenian un bloque "auto-vincular perfil"
-- que, si el usuario autenticado no tenia fila en profiles, le insertaba un
-- profile con role='owner' sobre el primer business_id de la tabla (o un UUID
-- fijo hardcodeado). Cualquier usuario que se registrara en Supabase Auth y
-- llamara la RPC una vez quedaba escalado a "owner" del negocio, saltandose
-- por completo RLS y la separacion multi-tenant. Se elimina el bloque y se
-- reemplaza por denegacion explicita.
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

  SELECT status, delivery_method, payment_method, transfer_details
  INTO v_current_db_status, v_delivery_method, v_payment_method, v_transfer_details
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
