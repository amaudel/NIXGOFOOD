-- =========================================================================
-- NIXGOFOOD MASTER DATABASE SETUP (Execútalo en Supabase SQL Editor)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLAS PRINCIPALES
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT, cover_image_url TEXT, description TEXT, phone TEXT, whatsapp TEXT,
  currency TEXT DEFAULT 'USD', currency_symbol TEXT DEFAULT '$',
  primary_color TEXT DEFAULT '#e11d48', secondary_color TEXT DEFAULT '#f59e0b',
  timezone TEXT DEFAULT 'America/Guayaquil', active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, address TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL, longitude NUMERIC(10, 7) NOT NULL,
  phone TEXT, active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, slug TEXT NOT NULL, icon TEXT DEFAULT '🌮',
  sort_order INT DEFAULT 0, active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  compare_at_price NUMERIC(10, 2) CHECK (compare_at_price >= 0), image_url TEXT,
  active BOOLEAN DEFAULT true, available BOOLEAN DEFAULT true, featured BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, required BOOLEAN DEFAULT false, min_selections INT DEFAULT 0, max_selections INT DEFAULT 1,
  sort_order INT DEFAULT 0, active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price_delta NUMERIC(10, 2) DEFAULT 0.00 CHECK (price_delta >= 0),
  available BOOLEAN DEFAULT true, sort_order INT DEFAULT 0, active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0, PRIMARY KEY (product_id, modifier_group_id)
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL, max_distance_km NUMERIC(5, 2) NOT NULL, fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  estimated_min_minutes INT DEFAULT 20, estimated_max_minutes INT DEFAULT 35, sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reconciliacion para instalaciones donde delivery_zones ya existia antes del
-- rediseno multi-sucursal (creada por la migracion production_baseline.sql sin
-- branch_id/max_distance_km). CREATE TABLE IF NOT EXISTS no altera una tabla
-- que ya existe, asi que sin esto las columnas nuevas nunca se agregan y toda
-- consulta con .eq('branch_id', ...) falla en runtime, dejando el checkout sin
-- zonas (todo pedido se reporta "fuera de zona de delivery").
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS max_distance_km NUMERIC(5, 2);
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS estimated_min_minutes INT DEFAULT 20;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS estimated_max_minutes INT DEFAULT 35;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Las filas heredadas (esquema por poligono, sin max_distance_km) nunca podran
-- matchear ninguna distancia; se desactivan para que no interfieran con las
-- zonas nuevas sembradas mas abajo.
UPDATE delivery_zones SET active = false WHERE max_distance_km IS NULL;

CREATE TABLE IF NOT EXISTS motorizados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL, whatsapp TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motorizados_branch ON motorizados(branch_id);

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL, close_time TIME NOT NULL, closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'operator')),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1050;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_number INT DEFAULT nextval('order_number_seq'),
  tracking_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled')),
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('delivery', 'pickup')),
  payment_method TEXT DEFAULT 'cash',
  transfer_details JSONB,
  verification_status TEXT,
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  delivery_address TEXT, delivery_reference TEXT, delivery_location_type TEXT,
  delivery_latitude NUMERIC(10, 7), delivery_longitude NUMERIC(10, 7),
  delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_zone_name_snapshot TEXT, estimated_minutes TEXT DEFAULT '25-35 min', notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_details JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_status TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL, unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL CHECK (quantity > 0), notes TEXT, line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id UUID REFERENCES modifiers(id) ON DELETE SET NULL,
  modifier_name_snapshot TEXT NOT NULL, price_delta NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price_delta >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0), created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED BUSINESS & BRANCH (CON UUID HEXADECIMAL VÁLIDO)
INSERT INTO businesses (id, name, slug, phone, whatsapp, active)
VALUES ('b0000000-0000-0000-0000-000000000001', 'El Taca Nijo', 'el-taca-nijo', '0991234567', '0991234567', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, business_id, name, address, latitude, longitude, phone, active)
VALUES ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'El Taca Nijo - Matriz Cuenca', 'Av. Remigio Crespo Toral y Agustín Cueva, Cuenca, Ecuador', -2.90055, -79.00453, '0991234567', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO delivery_zones (id, business_id, branch_id, name, max_distance_km, fee, estimated_min_minutes, estimated_max_minutes, sort_order, active)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Zona 1 - Cercana', 2.0, 1.50, 20, 30, 1, true),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Zona 2 - Media', 4.0, 2.00, 25, 35, 2, true),
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Zona 3 - Extendida', 6.0, 2.50, 35, 45, 3, true)
ON CONFLICT (id) DO NOTHING;

-- Deactivate the stale flat-fee catch-all zone from earlier runs of this script,
-- which always matched first and made every delivery cost a fixed $2.50.
UPDATE delivery_zones SET active = false
WHERE id = 'd0000000-0000-0000-0000-000000000001' AND name = 'Zona Cuenca General';

INSERT INTO business_hours (business_id, branch_id, day_of_week, open_time, close_time, closed)
SELECT 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', d, '00:00:00'::TIME, '23:59:59'::TIME, false
FROM generate_series(0, 6) AS d
ON CONFLICT (branch_id, day_of_week) DO NOTHING;

-- DISTANCIA HAVERSINE
CREATE OR REPLACE FUNCTION calculate_distance_km(lat1 NUMERIC, lon1 NUMERIC, lat2 NUMERIC, lon2 NUMERIC) RETURNS NUMERIC AS $$
DECLARE R NUMERIC := 6371.0; dlat NUMERIC; dlon NUMERIC; a NUMERIC; c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN RETURN 9999.0; END IF;
  dlat := radians(lat2 - lat1); dlon := radians(lon2 - lon1);
  a := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2.0)^2;
  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  RETURN round(R * c, 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- FUNCIÓN TRANSACCIONAL: create_order
CREATE OR REPLACE FUNCTION create_order(p_payload JSONB)
RETURNS JSONB AS $$
DECLARE
  v_business_id UUID; v_branch_id UUID; v_business_active BOOLEAN; v_branch_active BOOLEAN; v_timezone TEXT;
  v_customer_name TEXT; v_customer_phone TEXT; v_customer_id UUID;
  v_delivery_method TEXT; v_cust_lat NUMERIC(10, 7); v_cust_lng NUMERIC(10, 7);
  v_branch_lat NUMERIC(10, 7); v_branch_lng NUMERIC(10, 7); v_address TEXT; v_reference TEXT; v_location_type TEXT;
  v_distance_km NUMERIC(5, 2); v_matched_zone_id UUID := NULL; v_matched_zone_name TEXT := NULL;
  v_delivery_fee NUMERIC(10, 2) := 0.00; v_estimated_minutes TEXT := '25-35 min';
  v_subtotal NUMERIC(10, 2) := 0.00; v_total NUMERIC(10, 2) := 0.00;
  v_order_id UUID; v_order_number INT; v_tracking_token TEXT; v_created_at TIMESTAMPTZ;
  v_item JSONB; v_product_id UUID; v_prod_name TEXT; v_prod_price NUMERIC(10, 2);
  v_mod JSONB; v_mod_id UUID; v_mod_name TEXT; v_mod_price NUMERIC(10, 2);
  v_item_unit_price NUMERIC(10, 2); v_item_qty INT; v_item_line_total NUMERIC(10, 2); v_order_item_id UUID; v_item_notes TEXT;
  v_payment_method TEXT; v_transfer_details JSONB; v_verification_status TEXT;
BEGIN
  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

  SELECT active, timezone INTO v_business_active, v_timezone FROM businesses WHERE id = v_business_id;
  IF v_business_active IS NOT TRUE THEN RAISE EXCEPTION 'El negocio no existe o no se encuentra activo.'; END IF;

  SELECT active, latitude, longitude INTO v_branch_active, v_branch_lat, v_branch_lng FROM branches WHERE id = v_branch_id AND business_id = v_business_id;
  IF v_branch_active IS NOT TRUE THEN RAISE EXCEPTION 'La sucursal seleccionada no se encuentra activa.'; END IF;

  v_customer_name := TRIM(p_payload->'customer'->>'name');
  v_customer_phone := TRIM(p_payload->'customer'->>'phone');
  IF LENGTH(v_customer_name) = 0 OR LENGTH(v_customer_phone) < 7 THEN RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos.'; END IF;

  SELECT id INTO v_customer_id FROM customers WHERE business_id = v_business_id AND phone = v_customer_phone LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (business_id, name, phone) VALUES (v_business_id, v_customer_name, v_customer_phone) RETURNING id INTO v_customer_id;
  END IF;

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
    FROM delivery_zones WHERE branch_id = v_branch_id AND active = true AND v_distance_km <= max_distance_km ORDER BY max_distance_km ASC LIMIT 1;

    IF v_matched_zone_id IS NULL THEN
      RAISE EXCEPTION 'La ubicación seleccionada (%.1f km) se encuentra fuera de nuestra zona de delivery.', v_distance_km;
    END IF;
  ELSIF v_delivery_method = 'pickup' THEN
    v_delivery_fee := 0.00; v_estimated_minutes := '15-25 min';
  ELSE RAISE EXCEPTION 'Método de entrega no válido.'; END IF;

  IF jsonb_array_length(p_payload->'items') = 0 THEN RAISE EXCEPTION 'El carrito de compras está vacío.'; END IF;

  v_subtotal := 0.00;
  v_payment_method := COALESCE(p_payload->>'paymentMethod', 'cash');
  v_transfer_details := p_payload->'transferDetails';
  IF v_payment_method = 'transfer' THEN v_verification_status := 'pending'; END IF;

  v_tracking_token := encode(gen_random_bytes(16), 'hex');

  INSERT INTO orders (
    business_id, branch_id, customer_id, tracking_token, status, delivery_method,
    payment_method, transfer_details, verification_status, subtotal, delivery_fee, total,
    customer_name, customer_phone, delivery_address, delivery_reference, delivery_location_type,
    delivery_latitude, delivery_longitude, delivery_zone_id, delivery_zone_name_snapshot, estimated_minutes, notes
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_tracking_token, 'new', v_delivery_method,
    v_payment_method, v_transfer_details, v_verification_status, 0.00, v_delivery_fee, 0.00,
    v_customer_name, v_customer_phone, v_address, v_reference, v_location_type,
    v_cust_lat, v_cust_lng, v_matched_zone_id, v_matched_zone_name, v_estimated_minutes, p_payload->>'notes'
  ) RETURNING id, order_number, created_at INTO v_order_id, v_order_number, v_created_at;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    v_item_qty := (v_item->>'quantity')::INT;
    v_item_notes := v_item->>'notes';
    IF v_item_qty <= 0 THEN RAISE EXCEPTION 'La cantidad del producto debe ser mayor a 0.'; END IF;

    v_prod_name := v_item->>'productName';
    v_prod_price := COALESCE((v_item->>'unitPrice')::NUMERIC, 0.00);

    -- Validación segura de UUID para IDs de producto
    IF (v_item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_product_id := (v_item->>'productId')::UUID;
      SELECT name, price INTO v_prod_name, v_prod_price FROM products WHERE id = v_product_id;
      IF v_prod_name IS NULL THEN
        v_prod_name := v_item->>'productName';
        v_prod_price := COALESCE((v_item->>'unitPrice')::NUMERIC, 0.00);
      END IF;
    ELSE
      v_product_id := NULL;
    END IF;

    v_item_unit_price := v_prod_price;

    INSERT INTO order_items (order_id, product_id, product_name_snapshot, unit_price, quantity, notes, line_total)
    VALUES (v_order_id, v_product_id, v_prod_name, v_prod_price, v_item_qty, v_item_notes, 0.00) RETURNING id INTO v_order_item_id;

    IF v_item ? 'selectedModifiers' AND jsonb_array_length(v_item->'selectedModifiers') > 0 THEN
      FOR v_mod IN SELECT * FROM jsonb_array_elements(v_item->'selectedModifiers') LOOP
        IF (v_mod->>'modifierId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_mod_id := (v_mod->>'modifierId')::UUID;
        ELSE
          v_mod_id := NULL;
        END IF;

        v_mod_name := v_mod->>'modifierName';
        v_mod_price := COALESCE((v_mod->>'price')::NUMERIC, 0.00);
        v_item_unit_price := v_item_unit_price + v_mod_price;

        INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name_snapshot, price_delta, quantity)
        VALUES (v_order_item_id, v_mod_id, v_mod_name, v_mod_price, 1);
      END LOOP;
    END IF;

    v_item_line_total := v_item_unit_price * v_item_qty;
    UPDATE order_items SET unit_price = v_item_unit_price, line_total = v_item_line_total WHERE id = v_order_item_id;
    v_subtotal := v_subtotal + v_item_line_total;
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  UPDATE orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id, 'orderNumber', '#' || v_order_number, 'trackingToken', v_tracking_token,
    'subtotal', v_subtotal, 'deliveryFee', v_delivery_fee, 'total', v_total,
    'status', 'new', 'estimatedTime', v_estimated_minutes, 'createdAt', v_created_at,
    'deliveryMethod', v_delivery_method, 'paymentMethod', v_payment_method,
    'deliveryLocation', CASE WHEN v_delivery_method = 'delivery' THEN jsonb_build_object(
      'latitude', v_cust_lat, 'longitude', v_cust_lng, 'address', v_address,
      'reference', v_reference, 'locationType', v_location_type
    ) ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS READ & UPDATE POLICIES FOR ORDERS & PROFILES
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read orders" ON orders;
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public update orders" ON orders;
CREATE POLICY "Public update orders" ON orders FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read order_items" ON order_items;
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read order_item_modifiers" ON order_item_modifiers;
CREATE POLICY "Public read order_item_modifiers" ON order_item_modifiers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- STORAGE OBJECTS POLICY FOR SIGNED URL GENERATION
DROP POLICY IF EXISTS "Allow select payment-proofs" ON storage.objects;
CREATE POLICY "Allow select payment-proofs"
ON storage.objects FOR SELECT
TO public, anon, authenticated
USING (bucket_id = 'payment-proofs');

-- RLS PARA BRANCHES (multi-sucursal)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active branches" ON branches;
CREATE POLICY "Public read active branches" ON branches
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Authenticated read all branches" ON branches;
CREATE POLICY "Authenticated read all branches" ON branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage branches" ON branches;
DROP POLICY IF EXISTS "Authenticated insert branches" ON branches;
DROP POLICY IF EXISTS "Authenticated update branches" ON branches;
CREATE POLICY "Authenticated insert branches" ON branches
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update branches" ON branches
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON branches TO public, anon, authenticated;
GRANT INSERT, UPDATE ON branches TO authenticated;

-- RLS PARA DELIVERY_ZONES (multi-sucursal)
-- production_baseline.sql ya habia hecho ENABLE ROW LEVEL SECURITY sobre esta
-- tabla sin crear ninguna politica, lo que deniega toda lectura por defecto
-- (anon/public reciben 0 filas). Sin este bloque, aunque el schema este
-- reconciliado arriba, el checkout nunca ve zonas de delivery.
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active delivery zones" ON delivery_zones;
CREATE POLICY "Public read active delivery zones" ON delivery_zones
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Authenticated read all delivery zones" ON delivery_zones;
CREATE POLICY "Authenticated read all delivery zones" ON delivery_zones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage delivery zones" ON delivery_zones;
DROP POLICY IF EXISTS "Authenticated insert delivery zones" ON delivery_zones;
DROP POLICY IF EXISTS "Authenticated update delivery zones" ON delivery_zones;
CREATE POLICY "Authenticated insert delivery zones" ON delivery_zones
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update delivery zones" ON delivery_zones
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON delivery_zones TO public, anon, authenticated;
GRANT INSERT, UPDATE ON delivery_zones TO authenticated;

-- RLS PARA MOTORIZADOS (directorio de repartidores por sucursal)
-- Solo se usa dentro del panel admin (autenticado), a diferencia de branches y
-- delivery_zones no necesita lectura publica/anon.
ALTER TABLE motorizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read all motorizados" ON motorizados;
CREATE POLICY "Authenticated read all motorizados" ON motorizados
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert motorizados" ON motorizados;
CREATE POLICY "Authenticated insert motorizados" ON motorizados
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update motorizados" ON motorizados;
CREATE POLICY "Authenticated update motorizados" ON motorizados
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON motorizados TO authenticated;

-- GRANTS FOR PUBLIC & ANON ACCESS
GRANT SELECT, UPDATE ON orders TO public, anon, authenticated;
GRANT SELECT ON order_items TO public, anon, authenticated;
GRANT SELECT ON order_item_modifiers TO public, anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT EXECUTE ON FUNCTION create_order(JSONB) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_distance_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO public, anon, authenticated;
