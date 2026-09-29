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
VALUES ('b0000000-0000-0000-0000-000000000001', '404', '404', '0991234567', '0991234567', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, business_id, name, address, latitude, longitude, phone, active)
VALUES ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '404 - Av. Juan Íñiguez', 'Av. Juan Íñiguez V. 1-73, Cuenca, Ecuador', -2.8988, -79.0058, '0991234567', true)
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

-- FUNCIÓN TRANSACCIONAL: create_order — eliminada de este script.
-- Esta versión confiaba en el `productName`/`unitPrice` enviados por el
-- cliente cuando el productId no era un UUID válido o no se encontraba, y no
-- filtraba `products`/`modifiers` por business_id (permitía inyectar
-- productos de OTRO negocio o precios arbitrarios en el pedido). La versión
-- correcta (valida business_id y usa siempre el precio de la base de datos)
-- vive en supabase/legacy_migrations/20260819_pre_baseline/20260818_order_transition_hardening.sql
-- y es la que gestionan las migraciones; no se debe redefinir aquí.

-- SEGURIDAD (RLS/GRANTS): eliminado de este script.
-- El bloque que existía aquí habilitaba políticas "USING (true)" / "WITH CHECK
-- (true)" sobre orders/branches/delivery_zones/motorizados y un GRANT UPDATE
-- directo sobre orders a anon/authenticated — es decir, cualquier visitante
-- anónimo podía leer y modificar los pedidos de CUALQUIER negocio, y cualquier
-- usuario autenticado podía escribir sucursales/zonas/motorizados de otro
-- negocio. Este script de SQL Editor no está trackeado por
-- `supabase db push`, así que esas políticas quedaban fuera de control de
-- versiones y podían reintroducirse silenciosamente si alguien lo volvía a
-- ejecutar. RLS/GRANTs correctos y con aislamiento multi-tenant ahora viven
-- exclusivamente en supabase/migrations/20260827000000_rls_hardening.sql —
-- ese archivo es la única fuente reproducible de políticas para este proyecto.
GRANT EXECUTE ON FUNCTION create_order(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_distance_km(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
