-- ============================================================================
-- NIXGOFOOD: RLS HARDENING & MULTI-TENANT ISOLATION
-- Contexto: supabase/scripts/master_setup.sql (script manual de SQL Editor,
--   nunca trackeado por `supabase db push`) dejó políticas "USING (true)" /
--   "WITH CHECK (true)" en orders, branches, delivery_zones y motorizados, y
--   un GRANT UPDATE directo sobre orders a anon/authenticated. Esa deriva nunca
--   fue revertida por 20260819091500_production_baseline.sql porque sus
--   CREATE TABLE IF NOT EXISTS no tocan políticas/columnas de tablas ya
--   existentes. Esta migración es la fuente única y reproducible de RLS para
--   el esquema realmente en producción (business_id/active/available,
--   branches/customer_id/order_number en orders, tabla motorizados) — el
--   mismo que usan src/repositories/supabase/*.ts.
-- ============================================================================

-- 1. HELPERS SECURITY DEFINER (search_path fijo, sin recursión RLS)
CREATE OR REPLACE FUNCTION public.current_user_business_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_business_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;

-- 2. INDICES DE SOPORTE PARA LOS PREDICADOS DE LAS POLITICAS
CREATE INDEX IF NOT EXISTS idx_branches_business_id ON public.branches(business_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_business_id ON public.business_hours(business_id);
CREATE INDEX IF NOT EXISTS idx_categories_business_id ON public.categories(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_business_id ON public.modifier_groups(business_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_business_id ON public.modifiers(business_id);
CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_product_id ON public.product_modifier_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_business_id ON public.delivery_zones(business_id);
CREATE INDEX IF NOT EXISTS idx_motorizados_business_id ON public.motorizados(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_id ON public.orders(business_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_order_item_id ON public.order_item_modifiers(order_item_id);
CREATE INDEX IF NOT EXISTS idx_profiles_business_id ON public.profiles(business_id);

-- 3. LIMPIEZA DE POLITICAS Y GRANTS PELIGROSOS (master_setup.sql / legacy)
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
DROP POLICY IF EXISTS "Public update orders" ON public.orders;
DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;
DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin manage order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public read order_item_modifiers" ON public.order_item_modifiers;
DROP POLICY IF EXISTS "Admin manage order_item_modifiers" ON public.order_item_modifiers;
DROP POLICY IF EXISTS "Authenticated manage branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated insert branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated update branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated read all branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated manage delivery zones" ON public.delivery_zones;
DROP POLICY IF EXISTS "Authenticated insert delivery zones" ON public.delivery_zones;
DROP POLICY IF EXISTS "Authenticated update delivery zones" ON public.delivery_zones;
DROP POLICY IF EXISTS "Authenticated read all delivery zones" ON public.delivery_zones;
DROP POLICY IF EXISTS "Authenticated read all motorizados" ON public.motorizados;
DROP POLICY IF EXISTS "Authenticated insert motorizados" ON public.motorizados;
DROP POLICY IF EXISTS "Authenticated update motorizados" ON public.motorizados;

REVOKE UPDATE, INSERT, DELETE ON public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.order_items FROM PUBLIC, anon;
REVOKE ALL ON public.order_item_modifiers FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.branches, public.delivery_zones, public.motorizados FROM PUBLIC, anon;

-- 4. RLS + POLITICAS EXPLICITAS POR TABLA

-- businesses (tenant root; id = business_id)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active businesses" ON public.businesses;
CREATE POLICY "Public read active businesses" ON public.businesses
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff read own business" ON public.businesses;
CREATE POLICY "Staff read own business" ON public.businesses
  FOR SELECT TO authenticated USING (id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update own business" ON public.businesses;
CREATE POLICY "Staff update own business" ON public.businesses
  FOR UPDATE TO authenticated
  USING (id = public.current_user_business_id() AND public.current_user_role() IN ('owner', 'admin'))
  WITH CHECK (id = public.current_user_business_id());
GRANT SELECT ON public.businesses TO public, anon, authenticated;
GRANT UPDATE ON public.businesses TO authenticated;

-- branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active branches" ON public.branches;
CREATE POLICY "Public read active branches" ON public.branches
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select branches" ON public.branches;
CREATE POLICY "Staff select branches" ON public.branches
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert branches" ON public.branches;
CREATE POLICY "Staff insert branches" ON public.branches
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update branches" ON public.branches;
CREATE POLICY "Staff update branches" ON public.branches
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete branches" ON public.branches;
CREATE POLICY "Staff delete branches" ON public.branches
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.branches TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branches TO authenticated;

-- business_hours (sin dato sensible; lectura publica total, escritura acotada)
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read business_hours" ON public.business_hours;
CREATE POLICY "Public read business_hours" ON public.business_hours
  FOR SELECT TO public, anon, authenticated USING (true);
DROP POLICY IF EXISTS "Staff insert business_hours" ON public.business_hours;
CREATE POLICY "Staff insert business_hours" ON public.business_hours
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update business_hours" ON public.business_hours;
CREATE POLICY "Staff update business_hours" ON public.business_hours
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete business_hours" ON public.business_hours;
CREATE POLICY "Staff delete business_hours" ON public.business_hours
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.business_hours TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;

-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
CREATE POLICY "Public read active categories" ON public.categories
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select categories" ON public.categories;
CREATE POLICY "Staff select categories" ON public.categories
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert categories" ON public.categories;
CREATE POLICY "Staff insert categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update categories" ON public.categories;
CREATE POLICY "Staff update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete categories" ON public.categories;
CREATE POLICY "Staff delete categories" ON public.categories
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.categories TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active products" ON public.products;
CREATE POLICY "Public read active products" ON public.products
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select products" ON public.products;
CREATE POLICY "Staff select products" ON public.products
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert products" ON public.products;
CREATE POLICY "Staff insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update products" ON public.products;
CREATE POLICY "Staff update products" ON public.products
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete products" ON public.products;
CREATE POLICY "Staff delete products" ON public.products
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.products TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- modifier_groups
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active modifier_groups" ON public.modifier_groups;
CREATE POLICY "Public read active modifier_groups" ON public.modifier_groups
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select modifier_groups" ON public.modifier_groups;
CREATE POLICY "Staff select modifier_groups" ON public.modifier_groups
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert modifier_groups" ON public.modifier_groups;
CREATE POLICY "Staff insert modifier_groups" ON public.modifier_groups
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update modifier_groups" ON public.modifier_groups;
CREATE POLICY "Staff update modifier_groups" ON public.modifier_groups
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete modifier_groups" ON public.modifier_groups;
CREATE POLICY "Staff delete modifier_groups" ON public.modifier_groups
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.modifier_groups TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.modifier_groups TO authenticated;

-- modifiers
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active modifiers" ON public.modifiers;
CREATE POLICY "Public read active modifiers" ON public.modifiers
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select modifiers" ON public.modifiers;
CREATE POLICY "Staff select modifiers" ON public.modifiers
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert modifiers" ON public.modifiers;
CREATE POLICY "Staff insert modifiers" ON public.modifiers
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update modifiers" ON public.modifiers;
CREATE POLICY "Staff update modifiers" ON public.modifiers
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete modifiers" ON public.modifiers;
CREATE POLICY "Staff delete modifiers" ON public.modifiers
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.modifiers TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.modifiers TO authenticated;

-- product_modifier_groups (junction; sin business_id propio -> join via product_id)
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read product_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "Public read product_modifier_groups" ON public.product_modifier_groups
  FOR SELECT TO public, anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.active = true)
  );
DROP POLICY IF EXISTS "Staff select product_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "Staff select product_modifier_groups" ON public.product_modifier_groups
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.business_id = public.current_user_business_id())
  );
DROP POLICY IF EXISTS "Staff insert product_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "Staff insert product_modifier_groups" ON public.product_modifier_groups
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.business_id = public.current_user_business_id())
    AND EXISTS (SELECT 1 FROM public.modifier_groups g WHERE g.id = modifier_group_id AND g.business_id = public.current_user_business_id())
  );
DROP POLICY IF EXISTS "Staff delete product_modifier_groups" ON public.product_modifier_groups;
CREATE POLICY "Staff delete product_modifier_groups" ON public.product_modifier_groups
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.business_id = public.current_user_business_id())
  );
GRANT SELECT ON public.product_modifier_groups TO public, anon, authenticated;
GRANT INSERT, DELETE ON public.product_modifier_groups TO authenticated;

-- delivery_zones
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active delivery zones" ON public.delivery_zones;
CREATE POLICY "Public read active delivery zones" ON public.delivery_zones
  FOR SELECT TO public, anon, authenticated USING (active = true);
DROP POLICY IF EXISTS "Staff select delivery_zones" ON public.delivery_zones;
CREATE POLICY "Staff select delivery_zones" ON public.delivery_zones
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert delivery_zones" ON public.delivery_zones;
CREATE POLICY "Staff insert delivery_zones" ON public.delivery_zones
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update delivery_zones" ON public.delivery_zones;
CREATE POLICY "Staff update delivery_zones" ON public.delivery_zones
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete delivery_zones" ON public.delivery_zones;
CREATE POLICY "Staff delete delivery_zones" ON public.delivery_zones
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.delivery_zones TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;

-- motorizados (solo panel admin; sin lectura publica)
ALTER TABLE public.motorizados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select motorizados" ON public.motorizados;
CREATE POLICY "Staff select motorizados" ON public.motorizados
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff insert motorizados" ON public.motorizados;
CREATE POLICY "Staff insert motorizados" ON public.motorizados
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update motorizados" ON public.motorizados;
CREATE POLICY "Staff update motorizados" ON public.motorizados
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff delete motorizados" ON public.motorizados;
CREATE POLICY "Staff delete motorizados" ON public.motorizados
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorizados TO authenticated;
REVOKE ALL ON public.motorizados FROM PUBLIC, anon;

-- customers (PII; solo staff del negocio, sin lectura publica)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage customers" ON public.customers;
DROP POLICY IF EXISTS "Staff select customers" ON public.customers;
CREATE POLICY "Staff select customers" ON public.customers
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
DROP POLICY IF EXISTS "Staff update customers" ON public.customers;
CREATE POLICY "Staff update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());
GRANT SELECT, UPDATE ON public.customers TO authenticated;
REVOKE ALL ON public.customers FROM PUBLIC, anon;
-- INSERT de customers queda exclusivamente via create_order() SECURITY DEFINER.

-- orders (PII + pagos; sin lectura publica, escritura solo via RPC SECURITY DEFINER)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select orders" ON public.orders;
CREATE POLICY "Staff select orders" ON public.orders
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());
GRANT SELECT ON public.orders TO authenticated;
REVOKE ALL ON public.orders FROM PUBLIC, anon;
-- INSERT/UPDATE quedan exclusivamente via create_order/transition_order_status/
-- rollback_order_status/verify_payment_status (SECURITY DEFINER). No hay policy
-- de escritura para authenticated => denegado por defecto; el tracking publico
-- se sirve por /api/orders/[trackingToken] con service_role (token opaco de 16 bytes).

-- order_items (hereda tenant desde orders.business_id)
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select order_items" ON public.order_items;
CREATE POLICY "Staff select order_items" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.business_id = public.current_user_business_id())
  );
GRANT SELECT ON public.order_items TO authenticated;
REVOKE ALL ON public.order_items FROM PUBLIC, anon;

-- order_item_modifiers (hereda tenant desde order_items -> orders.business_id)
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select order_item_modifiers" ON public.order_item_modifiers;
CREATE POLICY "Staff select order_item_modifiers" ON public.order_item_modifiers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_id AND o.business_id = public.current_user_business_id()
    )
  );
GRANT SELECT ON public.order_item_modifiers TO authenticated;
REVOKE ALL ON public.order_item_modifiers FROM PUBLIC, anon;

-- profiles: nunca INSERT/UPDATE/DELETE desde cliente (solo lectura propia)
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;

-- 5. STORAGE: payment-proofs — cerrar lectura publica total y acotar por negocio
DROP POLICY IF EXISTS "Allow select payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Staff view payment proof" ON storage.objects;
CREATE POLICY "Staff view payment proof" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.current_user_business_id()::text
);
