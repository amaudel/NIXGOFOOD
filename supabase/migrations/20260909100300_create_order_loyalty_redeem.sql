-- ============================================================================
-- NIXGOFOOD: create_order con canje de puntos de fidelizacion
-- Base: cuerpo verificado de 20260903000200_fix_gen_random_bytes_calificado.sql.
-- Unico cambio de negocio: bloque de canje de loyalty despues de conocer
-- v_subtotal, y v_total pasa a descontar v_discount_total.
-- ============================================================================

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
  v_extra_minutes INT := 0;
  v_prep_min INT;
  v_prep_max INT;
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
  -- Fidelizacion
  v_redeem_points_requested BOOLEAN := false;
  v_loyalty_enabled BOOLEAN;
  v_redeem_value NUMERIC(10,4);
  v_max_percent NUMERIC(5,2);
  v_loyalty_account_id UUID;
  v_available_points INT;
  v_max_discount_cap NUMERIC(10,2);
  v_discount_total NUMERIC(10,2) := 0.00;
  v_points_redeemed INT := 0;
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: Payload es obligatorio.';
  END IF;

  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

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

  v_dow := EXTRACT(DOW FROM (pg_catalog.now() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil')));
  v_curr_time := (pg_catalog.now() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil'))::TIME;

  SELECT closed INTO v_is_closed
  FROM public.business_hours
  WHERE branch_id = v_branch_id AND day_of_week = v_dow AND (v_curr_time < open_time OR v_curr_time > close_time OR closed = true);

  IF v_is_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado en este momento.';
  END IF;

  v_customer_name := pg_catalog.btrim(p_payload->'customer'->>'name');
  v_customer_phone := pg_catalog.btrim(p_payload->'customer'->>'phone');

  IF pg_catalog.length(v_customer_name) = 0 OR pg_catalog.length(v_customer_phone) < 7 THEN
    RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos para el contacto.';
  END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE business_id = v_business_id AND phone = v_customer_phone LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (business_id, name, phone)
    VALUES (v_business_id, v_customer_name, v_customer_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  v_extra_minutes := LEAST(GREATEST(COALESCE((p_payload->>'extraMinutes')::INT, 0), 0), 120);

  v_delivery_method := p_payload->>'deliveryMethod';

  IF v_delivery_method = 'delivery' THEN
    v_cust_lat := (p_payload->'deliveryLocation'->>'latitude')::NUMERIC;
    v_cust_lng := (p_payload->'deliveryLocation'->>'longitude')::NUMERIC;
    v_address := p_payload->'deliveryLocation'->>'address';
    v_reference := p_payload->'deliveryLocation'->>'reference';
    v_location_type := p_payload->'deliveryLocation'->>'locationType';

    v_distance_km := public.calculate_distance_km(v_branch_lat, v_branch_lng, v_cust_lat, v_cust_lng);

    SELECT id, name, fee, ((estimated_min_minutes + v_extra_minutes) || '-' || (estimated_max_minutes + v_extra_minutes) || ' min')
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
    SELECT COALESCE(pickup_prep_min_minutes, 15), COALESCE(pickup_prep_max_minutes, 25)
    INTO v_prep_min, v_prep_max
    FROM public.branches WHERE id = v_branch_id;
    v_estimated_minutes := (COALESCE(v_prep_min, 15) + v_extra_minutes) || '-' || (COALESCE(v_prep_max, 25) + v_extra_minutes) || ' min';
  ELSE
    RAISE EXCEPTION 'Método de entrega no válido.';
  END IF;

  IF pg_catalog.jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'El carrito de compras está vacío.';
  END IF;

  v_payment_method := COALESCE(p_payload->>'paymentMethod', 'cash');
  v_transfer_details := p_payload->'transferDetails';

  IF v_payment_method = 'transfer' THEN
    v_verification_status := 'pending';
    v_transfer_details := COALESCE(v_transfer_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('verificationStatus', 'pending');
    v_transfer_details := v_transfer_details - 'verifiedBy' - 'verifiedAt' - 'rejectionReason';
  ELSE
    v_transfer_details := NULL;
    v_verification_status := NULL;
  END IF;

  v_tracking_token := encode(extensions.gen_random_bytes(16), 'hex');

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

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payload->'items')
  LOOP
    v_product_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INT;
    v_item_notes := v_item->>'notes';

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad del producto debe ser mayor a 0.';
    END IF;

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

  -- ==========================================================================
  -- Fidelizacion: canje de puntos (opcional). Se recalcula todo aqui, nunca se
  -- confia en un descuento que venga del payload -- mismo criterio que precios
  -- de producto arriba.
  -- ==========================================================================
  v_redeem_points_requested := COALESCE((p_payload->>'redeemLoyaltyPoints')::BOOLEAN, false);

  IF v_redeem_points_requested THEN
    SELECT enabled, redemption_value_per_point, max_redeem_percent
    INTO v_loyalty_enabled, v_redeem_value, v_max_percent
    FROM public.loyalty_programs
    WHERE business_id = v_business_id;

    IF v_loyalty_enabled IS TRUE THEN
      SELECT id, points_balance INTO v_loyalty_account_id, v_available_points
      FROM public.loyalty_accounts
      WHERE business_id = v_business_id AND customer_id = v_customer_id
      FOR UPDATE;

      v_available_points := COALESCE(v_available_points, 0);

      IF v_available_points > 0 AND v_redeem_value > 0 THEN
        v_max_discount_cap := pg_catalog.round(v_subtotal * v_max_percent / 100, 2);
        v_points_redeemed := LEAST(v_available_points::NUMERIC, pg_catalog.floor(v_max_discount_cap / v_redeem_value))::INT;
        v_discount_total := pg_catalog.round(v_points_redeemed * v_redeem_value, 2);
      END IF;

      IF v_points_redeemed > 0 THEN
        UPDATE public.loyalty_accounts
        SET points_balance = points_balance - v_points_redeemed, updated_at = pg_catalog.now()
        WHERE id = v_loyalty_account_id;

        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        VALUES (v_business_id, v_customer_id, v_order_id, 'redeem', -v_points_redeemed, v_available_points - v_points_redeemed);
      END IF;
    END IF;
  END IF;

  v_total := v_subtotal - v_discount_total + v_delivery_fee;
  UPDATE public.orders
  SET subtotal = v_subtotal, total = v_total, discount_total = v_discount_total, points_redeemed = v_points_redeemed
  WHERE id = v_order_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order_id,
    'orderNumber', '#' || v_order_number,
    'trackingToken', v_tracking_token,
    'subtotal', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'discountTotal', v_discount_total,
    'pointsRedeemed', v_points_redeemed,
    'total', v_total,
    'status', 'new',
    'estimatedTime', v_estimated_minutes,
    'createdAt', v_created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO anon, authenticated;
