-- Tiempos de preparacion dinamicos segun carga de cocina.
-- Diseno: docs/superpowers/specs/2026-09-03-tiempos-preparacion-dinamicos-design.md
--
-- Todo vive por sucursal: cada cocina es fisica y tiene su propia
-- capacidad, mismo criterio que ya se usa para delivery_zones.

-- 1. Tiempo base de retiro + freno manual + techo, en cada sucursal.
--    Los defaults reproducen el comportamiento actual (la constante
--    PICKUP_PREP_TIME = '15 - 25 min' del checkout), asi que ningun
--    negocio existente cambia de comportamiento al desplegar esto.
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS pickup_prep_min_minutes INT NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS pickup_prep_max_minutes INT NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS auto_delay_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_extra_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_extra_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_extra_minutes INT NOT NULL DEFAULT 30;

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_prep_minutes_coherentes;
ALTER TABLE public.branches
  ADD CONSTRAINT branches_prep_minutes_coherentes
  CHECK (
    pickup_prep_min_minutes >= 0
    AND pickup_prep_max_minutes >= pickup_prep_min_minutes
    AND manual_extra_minutes >= 0
    AND max_extra_minutes >= 0
  );

-- 2. Escalones de carga. Calcados de delivery_zones: misma forma, mismo
--    modelo de permisos, misma pagina mental para el restaurante.
--    to_items NULL = tramo sin tope (el ultimo de la tabla).
CREATE TABLE IF NOT EXISTS public.prep_time_tiers (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  from_items INT NOT NULL,
  to_items INT,
  extra_minutes INT NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT prep_time_tiers_rango_coherente
    CHECK (from_items >= 0 AND extra_minutes >= 0 AND (to_items IS NULL OR to_items >= from_items))
);

CREATE INDEX IF NOT EXISTS idx_prep_time_tiers_branch ON public.prep_time_tiers(branch_id);
CREATE INDEX IF NOT EXISTS idx_prep_time_tiers_business ON public.prep_time_tiers(business_id);

-- 3. Indice para contar la carga. La consulta filtra por sucursal,
--    estado y antiguedad; sin este indice recorreria toda la tabla de
--    pedidos en cada visita al menu.
CREATE INDEX IF NOT EXISTS idx_orders_carga_cocina
  ON public.orders(branch_id, status, created_at);

-- 4. Permisos: mismo modelo que delivery_zones. Lectura publica (son
--    datos de configuracion que el menu necesita, no informacion de
--    clientes) y escritura solo para el staff del propio negocio.
ALTER TABLE public.prep_time_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active prep tiers" ON public.prep_time_tiers;
CREATE POLICY "Public read active prep tiers" ON public.prep_time_tiers
  FOR SELECT TO public, anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "Staff select prep_time_tiers" ON public.prep_time_tiers;
CREATE POLICY "Staff select prep_time_tiers" ON public.prep_time_tiers
  FOR SELECT TO authenticated USING (business_id = public.current_user_business_id());

DROP POLICY IF EXISTS "Staff insert prep_time_tiers" ON public.prep_time_tiers;
CREATE POLICY "Staff insert prep_time_tiers" ON public.prep_time_tiers
  FOR INSERT TO authenticated WITH CHECK (business_id = public.current_user_business_id());

DROP POLICY IF EXISTS "Staff update prep_time_tiers" ON public.prep_time_tiers;
CREATE POLICY "Staff update prep_time_tiers" ON public.prep_time_tiers
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id())
  WITH CHECK (business_id = public.current_user_business_id());

DROP POLICY IF EXISTS "Staff delete prep_time_tiers" ON public.prep_time_tiers;
CREATE POLICY "Staff delete prep_time_tiers" ON public.prep_time_tiers
  FOR DELETE TO authenticated USING (business_id = public.current_user_business_id());

REVOKE INSERT, UPDATE, DELETE ON public.prep_time_tiers FROM PUBLIC, anon;
GRANT SELECT ON public.prep_time_tiers TO public, anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prep_time_tiers TO authenticated;
