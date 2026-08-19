-- =========================================================================
-- MIGRACIÓN DE SEGURIDAD & HARDENING RLS MULTI-TENANT (ADMIN / KDS)
-- Archivo: 20260817_admin_kds_rls_hardening.sql
-- =========================================================================

-- 1. CREAR TABLA PROFILES (SI AÚN NO EXISTE EN PRODUCCIÓN)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'operator')),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FUNCIÓN SECURITY DEFINER CON SEARCH_PATH SEGURO
CREATE OR REPLACE FUNCTION public.current_user_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.current_user_business_id() TO public, anon, authenticated;

-- 3. HABILITAR RLS EN TODAS LAS TABLAS DE NEGOCIO Y PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICA PROFILES: Cada usuario solo lee su propio perfil
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

-- 5. POLÍTICAS ORDERS
-- Lectura pública para clientes (seguimiento de pedido)
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
CREATE POLICY "Public read orders" ON public.orders
FOR SELECT TO public, anon, authenticated
USING (true);

-- Administración de órdenes acotada estrictamente a business_id del admin autenticado
DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;
CREATE POLICY "Admin manage orders" ON public.orders
FOR ALL TO authenticated
USING (business_id = public.current_user_business_id())
WITH CHECK (business_id = public.current_user_business_id());

-- 6. POLÍTICAS ORDER_ITEMS
DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
CREATE POLICY "Public read order_items" ON public.order_items
FOR SELECT TO public, anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin manage order_items" ON public.order_items;
CREATE POLICY "Admin manage order_items" ON public.order_items
FOR ALL TO authenticated
USING (
  order_id IN (SELECT id FROM public.orders WHERE business_id = public.current_user_business_id())
);

-- 7. POLÍTICAS ORDER_ITEM_MODIFIERS
DROP POLICY IF EXISTS "Public read order_item_modifiers" ON public.order_item_modifiers;
CREATE POLICY "Public read order_item_modifiers" ON public.order_item_modifiers
FOR SELECT TO public, anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin manage order_item_modifiers" ON public.order_item_modifiers;
CREATE POLICY "Admin manage order_item_modifiers" ON public.order_item_modifiers
FOR ALL TO authenticated
USING (
  order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id IN (
      SELECT id FROM public.orders WHERE business_id = public.current_user_business_id()
    )
  )
);

-- GRANTS DE ACCESO SEGUROS
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO public, anon, authenticated;
GRANT SELECT ON public.order_items TO public, anon, authenticated;
GRANT SELECT ON public.order_item_modifiers TO public, anon, authenticated;
