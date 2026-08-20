-- =========================================================================
-- MIGRACIÓN DE HARDENING SERVER-SIDE PARA TRANSICIONES, PAGOS Y CREACIÓN DE PEDIDOS
-- Archivo: 20260818_order_transition_hardening.sql
-- =========================================================================

-- 1. REGLAS DE PRIVILEGIOS POSTGRESQL (BLOQUEO TOTAL DE UPDATE DIRECTO EN PUBLIC.ORDERS)
-- Revocar totalmente UPDATE en orders para public, anon y authenticated.
-- Todas las modificaciones de orders (status, transfer_details, timestamps) se realizan
-- exclusivamente a través de RPCs SECURITY DEFINER autorizadas.
REVOKE UPDATE ON public.orders FROM PUBLIC, anon, authenticated;


-- 2. FUNCIÓN RPC DE CREACIÓN DE PEDIDOS (HARDENED SERVER-SIDE, SEARCH_PATH SEGURO)
CREATE OR REPLACE FUNCTION public.create_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
  v_branch_id UUID;
  v_business_active BOOLEAN;
  v_branch_active BOOLEAN;
  v_timezone TEXT;

  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_customer_id UUID;

  v_delivery_method TEXT;
  v_cust_lat NUMERIC(10, 7);
  v_cust_lng NUMERIC(10, 7);
  v_branch_lat NUMERIC(10, 7);
  v_branch_lng NUMERIC(10, 7);
  v_address TEXT;
  v_reference TEXT;
  v_location_type TEXT;

  v_distance_km NUMERIC(5, 2);
  v_matched_zone_id UUID := NULL;
  v_matched_zone_name TEXT := NULL;
  v_delivery_fee NUMERIC(10, 2) := 0.00;
  v_estimated_minutes TEXT := '25-35 min';

  v_subtotal NUMERIC(10, 2) := 0.00;
  v_total NUMERIC(10, 2) := 0.00;

  v_order_id UUID;
  v_order_number INT;
  v_tracking_token TEXT;
  v_created_at TIMESTAMPTZ;

  v_item JSONB;
  v_product_id UUID;
  v_prod_name TEXT;
  v_prod_price NUMERIC(10, 2);
  v_prod_active BOOLEAN;
  v_prod_available BOOLEAN;

  v_mod JSONB;
  v_mod_id UUID;
  v_mod_name TEXT;
  v_mod_price NUMERIC(10, 2);
  v_mod_active BOOLEAN;
  v_mod_available BOOLEAN;

  v_item_unit_price NUMERIC(10, 2);
  v_item_qty INT;
  v_item_line_total NUMERIC(10, 2);
  v_order_item_id UUID;
  v_item_notes TEXT;

  v_dow INT;
  v_curr_time TIME;
  v_is_closed BOOLEAN := false;
  v_payment_method TEXT;
  v_transfer_details JSONB;
  v_verification_status TEXT := NULL;
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: Payload es obligatorio.';
  END IF;

  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

  -- 1. Validate Business & Branch existence & active status
  SELECT active, timezone INTO v_business_active, v_timezone
  FROM public.businesses WHERE id = v_business_id;

  IF v_business_active IS NOT TRUE THEN
    RAISE EXCEPTION 'El negocio no existe o no se encuentra activo.';
  END IF;

  SELECT active, latitude, longitude INTO v_branch_active, v_branch_lat, v_branch_lng
  FROM public.branches WHERE id = v_branch_id AND business_id = v_business_id;

  IF v_branch_active IS NOT TRUE THEN
    RAISE EXCEPTION 'La sucursal seleccionada no se encuentra activa.';
  END IF;

  -- 2. Validate Business Hours in Configured Timezone (Default America/Guayaquil)
  v_dow := EXTRACT(DOW FROM (pg_catalog.now() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil')));
  v_curr_time := (pg_catalog.now() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil'))::TIME;

  SELECT closed INTO v_is_closed
  FROM public.business_hours
  WHERE branch_id = v_branch_id AND day_of_week = v_dow AND (v_curr_time < open_time OR v_curr_time > close_time OR closed = true);

  IF v_is_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado en este momento.';
  END IF;

  -- 3. Extract Customer Info
  v_customer_name := pg_catalog.trim(p_payload->'customer'->>'name');
  v_customer_phone := pg_catalog.trim(p_payload->'customer'->>'phone');

  IF pg_catalog.length(v_customer_name) = 0 OR pg_catalog.length(v_customer_phone) < 7 THEN
    RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos para el contacto.';
  END IF;

  -- Upsert Customer
  SELECT id INTO v_customer_id FROM public.customers WHERE business_id = v_business_id AND phone = v_customer_phone LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (business_id, name, phone)
    VALUES (v_business_id, v_customer_name, v_customer_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  -- 4. Delivery Method & Distance / Zone Calculation
  v_delivery_method := p_payload->>'deliveryMethod';

  IF v_delivery_method = 'delivery' THEN
    v_cust_lat := (p_payload->'deliveryLocation'->>'latitude')::NUMERIC;
    v_cust_lng := (p_payload->'deliveryLocation'->>'longitude')::NUMERIC;
    v_address := p_payload->'deliveryLocation'->>'address';
    v_reference := p_payload->'deliveryLocation'->>'reference';
    v_location_type := p_payload->'deliveryLocation'->>'locationType';

    v_distance_km := public.calculate_distance_km(v_branch_lat, v_branch_lng, v_cust_lat, v_cust_lng);

    SELECT id, name, fee, (estimated_min_minutes || '-' || estimated_max_minutes || ' min')
    INTO v_matched_zone_id, v_matched_zone_name, v_delivery_fee, v_estimated_minutes
    FROM public.delivery_zones
    WHERE branch_id = v_branch_id AND active = true AND v_distance_km <= max_distance_km
    ORDER BY max_distance_km ASC
    LIMIT 1;

    IF v_matched_zone_id IS NULL THEN
      RAISE EXCEPTION 'La ubicación seleccionada (%.1f km) se encuentra fuera de nuestra zona de delivery.', v_distance_km;
    END IF;
  ELSIF v_delivery_method = 'pickup' THEN
    v_delivery_fee := 0.00;
    v_estimated_minutes := '15-25 min';
  ELSE
    RAISE EXCEPTION 'Método de entrega no válido.';
  END IF;

  -- 5. Process Items Array & Validate Prices & Availability
  IF pg_catalog.jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'El carrito de compras está vacío.';
  END IF;

  -- 6. Payment Method & Forced Pending Status for Transfer (Prevent Spoofing)
  v_payment_method := COALESCE(p_payload->>'paymentMethod', 'cash');
  v_transfer_details := p_payload->'transferDetails';

  IF v_payment_method = 'transfer' THEN
    v_verification_status := 'pending';
    v_transfer_details := COALESCE(v_transfer_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('verificationStatus', 'pending');
    -- Eliminar cualquier atributo administrativo falsificado desde cliente
    v_transfer_details := v_transfer_details - 'verifiedBy' - 'verifiedAt' - 'rejectionReason';
  ELSE
    v_transfer_details := NULL;
    v_verification_status := NULL;
  END IF;

  v_tracking_token := encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.orders (
    business_id, branch_id, customer_id, tracking_token, status, delivery_method,
    payment_method, transfer_details, verification_status,
    subtotal, delivery_fee, total, customer_name, customer_phone,
    delivery_address, delivery_reference, delivery_location_type,
    delivery_latitude, delivery_longitude, delivery_zone_id, delivery_zone_name_snapshot,
    estimated_minutes, notes
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_tracking_token, 'new', v_delivery_method,
    v_payment_method, v_transfer_details, v_verification_status,
    0.00, v_delivery_fee, 0.00, v_customer_name, v_customer_phone,
    v_address, v_reference, v_location_type,
    v_cust_lat, v_cust_lng, v_matched_zone_id, v_matched_zone_name,
    v_estimated_minutes, p_payload->>'notes'
  ) RETURNING id, order_number, created_at INTO v_order_id, v_order_number, v_created_at;

  -- Iterate through items
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payload->'items')
  LOOP
    v_product_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INT;
    v_item_notes := v_item->>'notes';

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad del producto debe ser mayor a 0.';
    END IF;

    -- Fetch Product Details
    SELECT name, price, active, available INTO v_prod_name, v_prod_price, v_prod_active, v_prod_available
    FROM public.products WHERE id = v_product_id AND business_id = v_business_id;

    IF v_prod_name IS NULL OR v_prod_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Un producto del carrito no existe o ya no está disponible.';
    END IF;

    IF v_prod_available IS NOT TRUE THEN
      RAISE EXCEPTION 'El producto "%" ya no está disponible (agotado).', v_prod_name;
    END IF;

    v_item_unit_price := v_prod_price;

    INSERT INTO public.order_items (
      order_id, product_id, product_name_snapshot, unit_price, quantity, notes, line_total
    ) VALUES (
      v_order_id, v_product_id, v_prod_name, v_prod_price, v_item_qty, v_item_notes, 0.00
    ) RETURNING id INTO v_order_item_id;

    IF v_item ? 'selectedModifiers' AND pg_catalog.jsonb_array_length(v_item->'selectedModifiers') > 0 THEN
      FOR v_mod IN SELECT * FROM pg_catalog.jsonb_array_elements(v_item->'selectedModifiers')
      LOOP
        v_mod_id := (v_mod->>'modifierId')::UUID;

        SELECT name, price_delta, active, available INTO v_mod_name, v_mod_price, v_mod_active, v_mod_available
        FROM public.modifiers WHERE id = v_mod_id AND business_id = v_business_id;

        IF v_mod_name IS NULL OR v_mod_active IS NOT TRUE OR v_mod_available IS NOT TRUE THEN
          RAISE EXCEPTION 'El extra "%" ya no está disponible.', v_mod->>'modifierName';
        END IF;

        v_item_unit_price := v_item_unit_price + v_mod_price;

        INSERT INTO public.order_item_modifiers (
          order_item_id, modifier_id, modifier_name_snapshot, price_delta, quantity
        ) VALUES (
          v_order_item_id, v_mod_id, v_mod_name, v_mod_price, 1
        );
      END LOOP;
    END IF;

    v_item_line_total := v_item_unit_price * v_item_qty;
    UPDATE public.order_items SET unit_price = v_item_unit_price, line_total = v_item_line_total WHERE id = v_order_item_id;
    v_subtotal := v_subtotal + v_item_line_total;
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  UPDATE public.orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'orderNumber', '#' || v_order_number,
    'trackingToken', v_tracking_token,
    'subtotal', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'total', v_total,
    'status', 'new',
    'estimatedTime', v_estimated_minutes,
    'createdAt', v_created_at
  );
END;
$$;

-- Endurecimiento estricto de permisos EXECUTE para create_order
REVOKE ALL ON FUNCTION public.create_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO anon, authenticated;


-- 3. FUNCIÓN RPC ATÓMICA DE TRANSICIÓN DE ESTADO (NO STRICT, SECURITY DEFINER SET search_path = '')
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

      IF p_reason IS NULL OR pg_catalog.length(pg_catalog.trim(p_reason)) < 3 THEN
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


-- 4. FUNCIÓN RPC ATÓMICA DE VERIFICACIÓN / RECHAZO / CORRECCIÓN DE PAGO POR TRANSFERENCIA
CREATE OR REPLACE FUNCTION public.verify_payment_status(
  p_order_id UUID,
  p_verification_status TEXT,
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
  v_current_details JSONB;
  v_current_status TEXT;
  v_updated_details JSONB;
BEGIN
  IF p_order_id IS NULL OR p_verification_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: p_order_id y p_verification_status son obligatorios.';
  END IF;

  -- Autenticación e Identidad del usuario servidor (JWT Real)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para verificar comprobante de pago.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo administradores o propietarios pueden verificar o rechazar pagos.';
  END IF;

  IF p_verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_PARAM: Estado de verificación no válido (%s). Usar verified o rejected.', p_verification_status;
  END IF;

  SELECT transfer_details INTO v_current_details
  FROM public.orders
  WHERE id = p_order_id AND business_id = v_business_id;

  IF v_current_details IS NULL THEN
    v_current_details := '{}'::jsonb;
  END IF;

  v_current_status := COALESCE(v_current_details->>'verificationStatus', 'pending');

  -- Validación de Motivo Obligatorio para Correcciones Administrativas (verified <-> rejected)
  IF (v_current_status = 'verified' AND p_verification_status = 'rejected') OR
     (v_current_status = 'rejected' AND p_verification_status = 'verified') THEN
    IF p_reason IS NULL OR pg_catalog.length(pg_catalog.trim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio (mínimo 3 caracteres) para corregir la verificación de pago previa.';
    END IF;
  END IF;

  v_updated_details := v_current_details || pg_catalog.jsonb_build_object(
    'verificationStatus', p_verification_status,
    'verifiedBy', v_user_name,
    'verifiedAt', pg_catalog.now()
  );

  IF p_reason IS NOT NULL AND pg_catalog.length(pg_catalog.trim(p_reason)) >= 3 THEN
    v_updated_details := v_updated_details || pg_catalog.jsonb_build_object('verificationReason', pg_catalog.trim(p_reason));
  END IF;

  UPDATE public.orders
  SET transfer_details = v_updated_details,
      updated_at = pg_catalog.now()
  WHERE id = p_order_id AND business_id = v_business_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'from_verification', v_current_status,
    'to_verification', p_verification_status,
    'verifiedBy', v_user_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) TO authenticated;


-- 5. FUNCIÓN RPC ATÓMICA DE ROLLBACK (NO STRICT, SEARCH_PATH SEGURO)
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

  -- Autenticación del usuario servidor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para revertir pedido.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

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

  -- Validación Server-Side de la Matriz de Transiciones de Retroceso
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
    IF p_reason IS NULL OR pg_catalog.length(pg_catalog.trim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio para reabrir pedido entregado.';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_BACKWARDS_TRANSITION: Transición de retroceso no permitida (% -> %).', p_expected_status, p_target_status;
  END IF;

  -- Compare-And-Swap (CAS) Atómico en UPDATE orders
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

  -- Registro Atómico en la Bitácora de Historial (Misma transacción)
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
    pg_catalog.now()
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
