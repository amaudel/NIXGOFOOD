-- ==========================================
-- 003_functions.sql
-- Transactional Order Creation RPC & Haversine Distance
-- ==========================================

-- 1. HAVERSINE DISTANCE FUNCTION IN POSTGRESQL (KM)
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 NUMERIC,
  lon1 NUMERIC,
  lat2 NUMERIC,
  lon2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  R NUMERIC := 6371.0;
  dlat NUMERIC;
  dlon NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN 9999.0;
  END IF;
  
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  
  a := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2.0)^2;
  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  
  RETURN round(R * c, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- 2. TRANSACTIONAL RPC: create_order
CREATE OR REPLACE FUNCTION create_order(p_payload JSONB)
RETURNS JSONB AS $$
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
BEGIN
  -- Extract Business & Branch IDs from payload
  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

  -- 1. Validate Business & Branch existence & active status
  SELECT active, timezone INTO v_business_active, v_timezone
  FROM businesses WHERE id = v_business_id;

  IF v_business_active IS NOT TRUE THEN
    RAISE EXCEPTION 'El negocio no existe o no se encuentra activo.';
  END IF;

  SELECT active, latitude, longitude INTO v_branch_active, v_branch_lat, v_branch_lng
  FROM branches WHERE id = v_branch_id AND business_id = v_business_id;

  IF v_branch_active IS NOT TRUE THEN
    RAISE EXCEPTION 'La sucursal seleccionada no se encuentra activa.';
  END IF;

  -- 2. Validate Business Hours in Configured Timezone (Default America/Guayaquil)
  v_dow := EXTRACT(DOW FROM (NOW() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil')));
  v_curr_time := (NOW() AT TIME ZONE COALESCE(v_timezone, 'America/Guayaquil'))::TIME;

  SELECT closed INTO v_is_closed
  FROM business_hours
  WHERE branch_id = v_branch_id AND day_of_week = v_dow AND (v_curr_time < open_time OR v_curr_time > close_time OR closed = true);

  IF v_is_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado en este momento.';
  END IF;

  -- 3. Extract Customer Info
  v_customer_name := TRIM(p_payload->'customer'->>'name');
  v_customer_phone := TRIM(p_payload->'customer'->>'phone');

  IF LENGTH(v_customer_name) = 0 OR LENGTH(v_customer_phone) < 7 THEN
    RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos para el contacto.';
  END IF;

  -- Upsert Customer
  SELECT id INTO v_customer_id FROM customers WHERE business_id = v_business_id AND phone = v_customer_phone LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (business_id, name, phone)
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

    v_distance_km := calculate_distance_km(v_branch_lat, v_branch_lng, v_cust_lat, v_cust_lng);

    SELECT id, name, fee, (estimated_min_minutes || '-' || estimated_max_minutes || ' min')
    INTO v_matched_zone_id, v_matched_zone_name, v_delivery_fee, v_estimated_minutes
    FROM delivery_zones
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
  IF jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'El carrito de compras está vacío.';
  END IF;

  v_subtotal := 0.00;

  -- 4.5 Extract Payment Method & Transfer Details
  DECLARE
    v_payment_method TEXT := COALESCE(p_payload->>'paymentMethod', 'cash');
    v_transfer_details JSONB := p_payload->'transferDetails';
    v_verification_status TEXT := NULL;
  BEGIN
    IF v_payment_method = 'transfer' THEN
      v_verification_status := 'pending';
    END IF;

    v_tracking_token := encode(gen_random_bytes(16), 'hex');

    INSERT INTO orders (
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
  END;

  -- Iterate through items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_product_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INT;
    v_item_notes := v_item->>'notes';

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad del producto debe ser mayor a 0.';
    END IF;

    -- Fetch Product Details
    SELECT name, price, active, available INTO v_prod_name, v_prod_price, v_prod_active, v_prod_available
    FROM products WHERE id = v_product_id AND business_id = v_business_id;

    IF v_prod_name IS NULL OR v_prod_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Un producto del carrito no existe o ya no está disponible.';
    END IF;

    IF v_prod_available IS NOT TRUE THEN
      RAISE EXCEPTION 'El producto "%" ya no está disponible (agotado).', v_prod_name;
    END IF;

    -- Unit price starts at base product price
    v_item_unit_price := v_prod_price;

    -- Insert Order Item Record
    INSERT INTO order_items (
      order_id, product_id, product_name_snapshot, unit_price, quantity, notes, line_total
    ) VALUES (
      v_order_id, v_product_id, v_prod_name, v_prod_price, v_item_qty, v_item_notes, 0.00
    ) RETURNING id INTO v_order_item_id;

    -- Process Selected Modifiers for this item
    IF v_item ? 'selectedModifiers' AND jsonb_array_length(v_item->'selectedModifiers') > 0 THEN
      FOR v_mod IN SELECT * FROM jsonb_array_elements(v_item->'selectedModifiers')
      LOOP
        v_mod_id := (v_mod->>'modifierId')::UUID;

        SELECT name, price_delta, active, available INTO v_mod_name, v_mod_price, v_mod_active, v_mod_available
        FROM modifiers WHERE id = v_mod_id AND business_id = v_business_id;

        IF v_mod_name IS NULL OR v_mod_active IS NOT TRUE OR v_mod_available IS NOT TRUE THEN
          RAISE EXCEPTION 'El extra "%" ya no está disponible.', v_mod->>'modifierName';
        END IF;

        v_item_unit_price := v_item_unit_price + v_mod_price;

        INSERT INTO order_item_modifiers (
          order_item_id, modifier_id, modifier_name_snapshot, price_delta, quantity
        ) VALUES (
          v_order_item_id, v_mod_id, v_mod_name, v_mod_price, 1
        );
      END LOOP;
    END IF;

    -- Update Order Item line total
    v_item_line_total := v_item_unit_price * v_item_qty;
    UPDATE order_items SET unit_price = v_item_unit_price, line_total = v_item_line_total WHERE id = v_order_item_id;

    -- Add to Subtotal
    v_subtotal := v_subtotal + v_item_line_total;
  END LOOP;

  -- 6. Recalculate Final Order Total
  v_total := v_subtotal + v_delivery_fee;

  UPDATE orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order_id;

  -- Return Confirmed Order Summary JSON
  RETURN jsonb_build_object(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
