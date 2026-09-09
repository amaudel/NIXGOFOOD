# Programa de fidelización por puntos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente que pide repetidamente en un negocio acumule puntos por lo que gasta y pueda canjearlos como descuento en un pedido futuro, sin login de cliente.

**Architecture:** Todo el cálculo y la validación vive en Postgres (funciones `SECURITY DEFINER`), igual que `create_order`/`transition_order_status`/`rollback_order_status` hoy. Tres tablas nuevas (`loyalty_programs`, `loyalty_accounts`, `loyalty_transactions` como ledger append-only). El frontend solo pregunta (`get_loyalty_quote`) y muestra lo que la base contesta; nunca calcula el descuento. El modo demo (negocios fixture, sin Supabase real) recibe siempre "fidelización deshabilitada" — sin persistencia paralela.

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase/PostgreSQL (funciones `plpgsql SECURITY DEFINER`) + Vitest.

**Spec:** [docs/superpowers/specs/2026-09-09-fidelizacion-puntos-design.md](../specs/2026-09-09-fidelizacion-puntos-design.md)

## Global Constraints

- RLS por `business_id` en toda tabla nueva, sin políticas `USING (true)` (ADR-002).
- Toda función nueva `SECURITY DEFINER` fija `SET search_path = ''` y califica funciones de extensión (ej. `extensions.uuid_generate_v4()`), igual que las funciones existentes (ADR-003).
- El servidor recalcula siempre el descuento/puntos desde cero contra el estado actual de la base — nunca confía en un número que mande el cliente (mismo criterio que ya aplica `create_order` con precios de producto).
- Las migraciones son la única fuente de verdad reproducible — nunca se edita a mano en el SQL Editor de producción (consecuencia de ADR-002). **Antes de aplicar la primera migración de este plan, verificar el esquema real de `orders`/funciones en producción** (la migración baseline trackeada ya demostró estar desactualizada respecto a `customer_id`/`order_number`) usando el mismo patrón que `scripts/test-supabase-prod-rollback.js`.
- Copys de cara al usuario en español, con el mismo tono que los mensajes de error existentes (ej. `'El carrito de compras está vacío.'`).
- El modo demo (`isDemoMode()` de `@/config/demo`) es la única fuente de verdad para esa rama — nunca releer `NEXT_PUBLIC_DEMO_MODE` directamente en código nuevo.

---

## Task 1: Esquema base — tablas de fidelización + RLS

**Files:**
- Create: `supabase/migrations/20260909100000_loyalty_schema.sql`

**Interfaces:**
- Produces: tablas `public.loyalty_programs(id, business_id, enabled, points_per_currency_unit, redemption_value_per_point, max_redeem_percent, created_at, updated_at)`, `public.loyalty_accounts(id, business_id, customer_id, points_balance, created_at, updated_at)`, `public.loyalty_transactions(id, business_id, customer_id, order_id, type, points, balance_after, created_at)`. Índice único parcial `idx_loyalty_transactions_order_type` sobre `(order_id, type) WHERE order_id IS NOT NULL` — lo consumen los Tasks 4-6 para idempotencia.

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================================
-- NIXGOFOOD: Esquema del programa de fidelización por puntos
-- Ver docs/superpowers/specs/2026-09-09-fidelizacion-puntos-design.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    points_per_currency_unit NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (points_per_currency_unit >= 0),
    redemption_value_per_point NUMERIC(10,4) NOT NULL DEFAULT 0.01 CHECK (redemption_value_per_point >= 0),
    max_redeem_percent NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (max_redeem_percent >= 0 AND max_redeem_percent <= 100),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_balance INT NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    UNIQUE (business_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'earn_reversal')),
    points INT NOT NULL,
    balance_after INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_order_type
  ON public.loyalty_transactions(order_id, type) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_business_id ON public.loyalty_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_business_id ON public.loyalty_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_account ON public.loyalty_transactions(business_id, customer_id);

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- loyalty_programs: el dueno/admin del negocio lo lee y edita. Sin acceso anon.
CREATE POLICY loyalty_programs_select ON public.loyalty_programs
  FOR SELECT TO authenticated
  USING (business_id = public.current_user_business_id());

CREATE POLICY loyalty_programs_insert ON public.loyalty_programs
  FOR INSERT TO authenticated
  WITH CHECK (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'));

CREATE POLICY loyalty_programs_update ON public.loyalty_programs
  FOR UPDATE TO authenticated
  USING (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'))
  WITH CHECK (business_id = public.current_user_business_id() AND public.current_user_role() IN ('owner','admin'));

GRANT SELECT, INSERT, UPDATE ON public.loyalty_programs TO authenticated;
REVOKE ALL ON public.loyalty_programs FROM anon;

-- loyalty_accounts / loyalty_transactions: sin politicas para anon/authenticated
-- a proposito -- solo las funciones SECURITY DEFINER (Tasks 3-6), que corren
-- como el owner de la funcion y no pasan por RLS de sesion, pueden tocarlas.
REVOKE ALL ON public.loyalty_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.loyalty_transactions FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2: Aplicar contra un proyecto Supabase de prueba/staging (nunca directo a producción) y verificar**

Run: `supabase db push` (o pegar el SQL en el SQL Editor del proyecto de staging).

Verificación:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'loyalty_%';
```
Expected: 3 filas (`loyalty_programs`, `loyalty_accounts`, `loyalty_transactions`).

```sql
SELECT relrowsecurity FROM pg_class WHERE relname LIKE 'loyalty_%';
```
Expected: `t` (true) en las 3 filas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100000_loyalty_schema.sql
git commit -m "feat(db): esquema de tablas para programa de fidelizacion por puntos"
```

---

## Task 2: Columnas de fidelización en `orders`

**Files:**
- Create: `supabase/migrations/20260909100100_orders_loyalty_columns.sql`

**Interfaces:**
- Consumes: tabla `public.orders` (Task 1 no la toca).
- Produces: columnas `orders.discount_total NUMERIC(10,2)`, `orders.points_redeemed INT`, `orders.points_earned INT`, usadas por los Tasks 4-6 y por el mapeo en `SupabaseOrderRepository.getOrders` (Task 8).

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================================
-- NIXGOFOOD: columnas de fidelizacion en orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS points_redeemed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_earned INT NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Aplicar y verificar**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
  AND column_name IN ('discount_total', 'points_redeemed', 'points_earned');
```
Expected: 3 filas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100100_orders_loyalty_columns.sql
git commit -m "feat(db): columnas discount_total/points_redeemed/points_earned en orders"
```

---

## Task 3: RPC `get_loyalty_quote` (cotización para el checkout)

**Files:**
- Create: `supabase/migrations/20260909100200_get_loyalty_quote_rpc.sql`

**Interfaces:**
- Consumes: `public.loyalty_programs`, `public.customers`, `public.loyalty_accounts` (Task 1).
- Produces: `public.get_loyalty_quote(p_business_id UUID, p_phone TEXT, p_subtotal NUMERIC) RETURNS JSONB` con forma `{ availablePoints: int, redeemablePoints: int, maxDiscount: numeric }`. La consume `src/lib/loyalty.ts` (Task 7).

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================================
-- NIXGOFOOD: RPC get_loyalty_quote
-- Cotiza cuantos puntos puede canjear un telefono en un negocio para un
-- subtotal dado. Callable por anon (mismo nivel que create_order): el
-- checkout no tiene sesion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_loyalty_quote(
  p_business_id UUID,
  p_phone TEXT,
  p_subtotal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_points_per_unit NUMERIC(10,4);
  v_redeem_value NUMERIC(10,4);
  v_max_percent NUMERIC(5,2);
  v_customer_id UUID;
  v_available_points INT := 0;
  v_max_discount_cap NUMERIC(10,2);
  v_redeemable_points INT := 0;
  v_max_discount NUMERIC(10,2) := 0;
BEGIN
  IF p_business_id IS NULL OR p_phone IS NULL OR p_subtotal IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('availablePoints', 0, 'redeemablePoints', 0, 'maxDiscount', 0);
  END IF;

  SELECT enabled, points_per_currency_unit, redemption_value_per_point, max_redeem_percent
  INTO v_enabled, v_points_per_unit, v_redeem_value, v_max_percent
  FROM public.loyalty_programs
  WHERE business_id = p_business_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('availablePoints', 0, 'redeemablePoints', 0, 'maxDiscount', 0);
  END IF;

  SELECT id INTO v_customer_id FROM public.customers
  WHERE business_id = p_business_id AND phone = pg_catalog.btrim(p_phone) LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    SELECT points_balance INTO v_available_points
    FROM public.loyalty_accounts
    WHERE business_id = p_business_id AND customer_id = v_customer_id;
  END IF;

  v_available_points := COALESCE(v_available_points, 0);

  IF v_available_points > 0 AND v_redeem_value > 0 THEN
    v_max_discount_cap := pg_catalog.round(GREATEST(p_subtotal, 0) * v_max_percent / 100, 2);
    v_redeemable_points := LEAST(v_available_points, pg_catalog.floor(v_max_discount_cap / v_redeem_value)::INT);
    v_max_discount := pg_catalog.round(v_redeemable_points * v_redeem_value, 2);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'availablePoints', v_available_points,
    'redeemablePoints', v_redeemable_points,
    'maxDiscount', v_max_discount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_loyalty_quote(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_quote(UUID, TEXT, NUMERIC) TO anon, authenticated;
```

- [ ] **Step 2: Aplicar y verificar**

```sql
-- Negocio sin loyalty_programs configurado -> siempre 0, sin error
SELECT public.get_loyalty_quote('00000000-0000-0000-0000-000000000000'::uuid, '0991234567', 20.00);
```
Expected: `{"availablePoints": 0, "redeemablePoints": 0, "maxDiscount": 0}`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100200_get_loyalty_quote_rpc.sql
git commit -m "feat(db): RPC get_loyalty_quote para cotizar canje en checkout"
```

---

## Task 4: Canje en `create_order`

**Files:**
- Modify (vía `CREATE OR REPLACE`, migración nueva): `supabase/migrations/20260909100300_create_order_loyalty_redeem.sql`

**Interfaces:**
- Consumes: cuerpo verificado actual de `create_order` en `supabase/migrations/20260903000200_fix_gen_random_bytes_calificado.sql` (es la version confirmada corriendo en produccion — no la del baseline desactualizado). `public.loyalty_programs`, `public.loyalty_accounts`, `public.loyalty_transactions` (Task 1).
- Produces: `create_order` acepta `p_payload->>'redeemLoyaltyPoints'` (boolean, opcional) y devuelve además `discountTotal`, `pointsRedeemed` en el jsonb de respuesta. Esto lo consume `src/app/store/checkout/page.tsx` (Task 9).

**Antes de escribir el archivo:** releer `supabase/migrations/20260903000200_fix_gen_random_bytes_calificado.sql` completo para confirmar que sigue siendo la versión activa (por la deriva documentada) — si production tiene una versión distinta, partir de esa, no de esta.

- [ ] **Step 1: Escribir la migración completa (cuerpo verificado + bloque de canje)**

```sql
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
  v_points_per_unit NUMERIC(10,4);
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
    SELECT enabled, points_per_currency_unit, redemption_value_per_point, max_redeem_percent
    INTO v_loyalty_enabled, v_points_per_unit, v_redeem_value, v_max_percent
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
        v_points_redeemed := LEAST(v_available_points, pg_catalog.floor(v_max_discount_cap / v_redeem_value)::INT);
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
```

- [ ] **Step 2: Aplicar y verificar**

En staging, con un negocio con `loyalty_programs.enabled = false` (o sin fila):
```sql
-- crear un pedido de prueba pasando "redeemLoyaltyPoints": true en el payload
-- Expected: discountTotal = 0, pointsRedeemed = 0 (no hay programa activo)
```

Con `loyalty_programs.enabled = true` y una fila de `loyalty_accounts` con `points_balance = 500`, `redemption_value_per_point = 0.01`, `max_redeem_percent = 30`, subtotal de prueba $20:
```sql
-- tope = 20 * 30/100 = 6.00 -> redeemable = min(500, floor(6.00/0.01)) = 500 (mayor que 500 disponibles) -> 500 puntos, $5.00 no, recalcular:
-- floor(6.00/0.01) = 600, LEAST(500, 600) = 500 -> discount = 500*0.01 = 5.00
-- Expected: discountTotal = 5.00, pointsRedeemed = 500, total = subtotal - 5.00 + deliveryFee
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100300_create_order_loyalty_redeem.sql
git commit -m "feat(db): create_order acepta canje de puntos de fidelizacion"
```

---

## Task 5: Acreditación en `transition_order_status`

**Files:**
- Create: `supabase/migrations/20260909100400_transition_order_status_loyalty_earn.sql`

**Interfaces:**
- Consumes: cuerpo verificado actual de `transition_order_status` en `supabase/migrations/20260820000200_transition_order_status_rpc.sql`. `public.loyalty_programs`, `public.loyalty_accounts`, `public.loyalty_transactions` (Task 1), `orders.discount_total`/`points_earned` (Task 2).
- Produces: cuando una acción lleva un pedido a `status = 'delivered'`, se acredita `floor((subtotal - discount_total) * points_per_currency_unit)` puntos, idempotente por `UNIQUE(order_id, type)`.

- [ ] **Step 1: Escribir la migración completa (cuerpo verificado + bloque de acreditación)**

```sql
-- ============================================================================
-- NIXGOFOOD: transition_order_status con acreditacion de puntos al entregar
-- Base: cuerpo verificado de 20260820000200_transition_order_status_rpc.sql.
-- Cambios de negocio: el SELECT inicial ahora tambien trae customer_id,
-- subtotal y discount_total; bloque de acreditacion cuando v_target_status
-- = 'delivered', despues del INSERT en order_status_history.
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
  -- Fidelizacion
  v_customer_id UUID;
  v_subtotal NUMERIC(10,2);
  v_discount_total NUMERIC(10,2);
  v_loyalty_enabled BOOLEAN;
  v_points_per_unit NUMERIC(10,4);
  v_points_earned INT;
  v_loyalty_account_id UUID;
  v_txn_id UUID;
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

  SELECT status, delivery_method, payment_method, transfer_details, customer_id, subtotal, discount_total
  INTO v_current_db_status, v_delivery_method, v_payment_method, v_transfer_details, v_customer_id, v_subtotal, v_discount_total
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

  -- ==========================================================================
  -- Fidelizacion: acreditar puntos ganados solo al llegar a 'delivered'.
  -- Idempotente: la restriccion UNIQUE(order_id, type) evita doble
  -- acreditacion si esta RPC se reintenta para el mismo pedido.
  -- ==========================================================================
  IF v_target_status = 'delivered' THEN
    SELECT enabled, points_per_currency_unit INTO v_loyalty_enabled, v_points_per_unit
    FROM public.loyalty_programs WHERE business_id = v_business_id;

    IF v_loyalty_enabled IS TRUE THEN
      v_points_earned := pg_catalog.floor(GREATEST(v_subtotal - COALESCE(v_discount_total, 0), 0) * v_points_per_unit)::INT;

      IF v_points_earned > 0 THEN
        SELECT id INTO v_loyalty_account_id
        FROM public.loyalty_accounts
        WHERE business_id = v_business_id AND customer_id = v_customer_id
        FOR UPDATE;

        IF v_loyalty_account_id IS NULL THEN
          INSERT INTO public.loyalty_accounts (business_id, customer_id, points_balance)
          VALUES (v_business_id, v_customer_id, 0)
          RETURNING id INTO v_loyalty_account_id;
        END IF;

        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        SELECT v_business_id, v_customer_id, p_order_id, 'earn', v_points_earned, points_balance + v_points_earned
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id
        ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_txn_id;

        IF v_txn_id IS NOT NULL THEN
          UPDATE public.loyalty_accounts
          SET points_balance = points_balance + v_points_earned, updated_at = pg_catalog.now()
          WHERE id = v_loyalty_account_id;

          UPDATE public.orders SET points_earned = v_points_earned WHERE id = p_order_id;
        END IF;
      END IF;
    END IF;
  END IF;

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
```

- [ ] **Step 2: Aplicar y verificar**

Con un pedido de prueba con `subtotal=20`, `discount_total=0`, negocio con `loyalty_programs.enabled=true, points_per_currency_unit=1`, llevarlo hasta `DISPATCH_PICKUP` (pickup) o `DISPATCH_CONFIRM_DELIVERY` (delivery):
```sql
SELECT points_earned FROM public.orders WHERE id = '<order_id>';
-- Expected: 20

SELECT points_balance FROM public.loyalty_accounts WHERE business_id = '<business_id>' AND customer_id = '<customer_id>';
-- Expected: 20 (o balance previo + 20)

SELECT type, points FROM public.loyalty_transactions WHERE order_id = '<order_id>';
-- Expected: una fila ('earn', 20)
```

Reintentar la misma llamada RPC (simulando un retry de red) y repetir la última query: debe seguir siendo una sola fila `earn` (no dos).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100400_transition_order_status_loyalty_earn.sql
git commit -m "feat(db): acreditar puntos de fidelizacion al entregar un pedido"
```

---

## Task 6: Reversa en `rollback_order_status`

**Files:**
- Create: `supabase/migrations/20260909100500_rollback_order_status_loyalty_reversal.sql`

**Interfaces:**
- Consumes: cuerpo verificado actual de `rollback_order_status` en `supabase/migrations/20260827000100_fix_rpc_auto_provision_backdoor.sql` (líneas 237-330). `public.loyalty_accounts`, `public.loyalty_transactions` (Task 1).
- Produces: cuando se revierte `delivered -> on_the_way` (única transición hacia atrás que sale de `delivered` en este RPC), se reversa la transacción `earn` de ese pedido si existe, idempotente por el mismo índice único que Task 5.

- [ ] **Step 1: Escribir la migración completa (cuerpo verificado + bloque de reversa)**

```sql
-- ============================================================================
-- NIXGOFOOD: rollback_order_status con reversa de puntos ganados
-- Base: cuerpo verificado de 20260827000100_fix_rpc_auto_provision_backdoor.sql
-- (funcion rollback_order_status). Cambio de negocio: bloque de reversa
-- despues del INSERT en order_status_history, solo para la transicion
-- delivered -> on_the_way (la unica que sale de 'delivered' en esta RPC).
-- ============================================================================

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
  -- Fidelizacion
  v_customer_id UUID;
  v_earn_points INT;
  v_loyalty_account_id UUID;
  v_txn_id UUID;
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

  -- ==========================================================================
  -- Fidelizacion: si se revierte un pedido entregado, reversar los puntos que
  -- se le habian acreditado. Idempotente por el mismo indice unico que usa la
  -- acreditacion (UNIQUE(order_id, type)). Si por algun motivo el cliente ya
  -- gasto esos puntos en otro pedido, el balance se clampa a 0 en vez de
  -- quedar negativo (violaria el CHECK points_balance >= 0).
  -- ==========================================================================
  IF p_expected_status = 'delivered' AND p_target_status = 'on_the_way' THEN
    SELECT customer_id INTO v_customer_id FROM public.orders WHERE id = p_order_id;

    SELECT points INTO v_earn_points
    FROM public.loyalty_transactions
    WHERE order_id = p_order_id AND type = 'earn';

    IF v_earn_points IS NOT NULL AND v_earn_points > 0 THEN
      SELECT id INTO v_loyalty_account_id
      FROM public.loyalty_accounts
      WHERE business_id = v_business_id AND customer_id = v_customer_id
      FOR UPDATE;

      IF v_loyalty_account_id IS NOT NULL THEN
        INSERT INTO public.loyalty_transactions (business_id, customer_id, order_id, type, points, balance_after)
        SELECT v_business_id, v_customer_id, p_order_id, 'earn_reversal', -v_earn_points, GREATEST(points_balance - v_earn_points, 0)
        FROM public.loyalty_accounts WHERE id = v_loyalty_account_id
        ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_txn_id;

        IF v_txn_id IS NOT NULL THEN
          UPDATE public.loyalty_accounts
          SET points_balance = GREATEST(points_balance - v_earn_points, 0), updated_at = pg_catalog.now()
          WHERE id = v_loyalty_account_id;

          UPDATE public.orders SET points_earned = 0 WHERE id = p_order_id;
        END IF;
      END IF;
    END IF;
  END IF;

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
```

- [ ] **Step 2: Aplicar y verificar**

Continuando el pedido del Task 5 (que ganó 20 puntos y balance quedó en 20), como owner/admin llamar `rollback_order_status(p_order_id, 'delivered', 'on_the_way', 'prueba de reversa')`:
```sql
SELECT points_earned FROM public.orders WHERE id = '<order_id>';
-- Expected: 0

SELECT points_balance FROM public.loyalty_accounts WHERE business_id = '<business_id>' AND customer_id = '<customer_id>';
-- Expected: 0

SELECT type, points FROM public.loyalty_transactions WHERE order_id = '<order_id>' ORDER BY created_at;
-- Expected: ('earn', 20), ('earn_reversal', -20)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909100500_rollback_order_status_loyalty_reversal.sql
git commit -m "feat(db): reversar puntos de fidelizacion al reabrir un pedido entregado"
```

---

## Task 7: Tipos TypeScript

**Files:**
- Modify: `src/types/index.ts:198-218` (interface `Order`)

**Interfaces:**
- Produces: `Order.discountTotal?: number`, `Order.pointsRedeemed?: number`, `Order.pointsEarned?: number`; tipos nuevos `LoyaltyQuote` y `LoyaltyProgramConfig`. Los consume Task 8 (`src/lib/loyalty.ts`), Task 9 (checkout) y Task 10 (admin).

- [ ] **Step 1: Extender `Order` y agregar los tipos nuevos**

En `src/types/index.ts`, dentro de `interface Order` (después de `total: number;`, línea 213):

```typescript
  discountTotal?: number;
  pointsRedeemed?: number;
  pointsEarned?: number;
```

Después del cierre de `interface Order` (después de la línea 218), agregar:

```typescript
export interface LoyaltyQuote {
  availablePoints: number;
  redeemablePoints: number;
  maxDiscount: number;
}

export interface LoyaltyProgramConfig {
  enabled: boolean;
  pointsPerCurrencyUnit: number;
  redemptionValuePerPoint: number;
  maxRedeemPercent: number;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `Order`/`LoyaltyQuote`/`LoyaltyProgramConfig`.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): campos y tipos de fidelizacion por puntos"
```

---

## Task 8: `src/lib/loyalty.ts` (cliente ligero, con stub en modo demo)

**Files:**
- Create: `src/lib/loyalty.ts`
- Test: `src/lib/__tests__/loyalty.test.ts`

**Interfaces:**
- Consumes: `isDemoMode` de `@/config/demo`, `createClient` de `@/lib/supabase/client`, `LoyaltyQuote`/`LoyaltyProgramConfig` de `@/types` (Task 7). RPC `get_loyalty_quote` (Task 3), tabla `loyalty_programs` (Task 1).
- Produces: `getLoyaltyQuote(businessId: string, phone: string, subtotal: number): Promise<LoyaltyQuote>`, `getLoyaltyProgramConfig(businessId: string): Promise<LoyaltyProgramConfig | null>`, `saveLoyaltyProgramConfig(businessId: string, config: LoyaltyProgramConfig): Promise<void>`. Los consumen Task 9 (checkout) y Task 10 (admin).

- [ ] **Step 1: Escribir el test que falla primero**

Crear `src/lib/__tests__/loyalty.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/demo', () => ({
  isDemoMode: vi.fn(),
}));

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { isDemoMode } from '@/config/demo';
import { getLoyaltyQuote, getLoyaltyProgramConfig, saveLoyaltyProgramConfig } from '../loyalty';

describe('loyalty (modo demo)', () => {
  beforeEach(() => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('getLoyaltyQuote devuelve todo en cero sin llamar a Supabase', async () => {
    const quote = await getLoyaltyQuote('biz_1', '0991234567', 20);
    expect(quote).toEqual({ availablePoints: 0, redeemablePoints: 0, maxDiscount: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('getLoyaltyProgramConfig devuelve null sin llamar a Supabase', async () => {
    const config = await getLoyaltyProgramConfig('biz_1');
    expect(config).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('saveLoyaltyProgramConfig rechaza con mensaje claro', async () => {
    await expect(
      saveLoyaltyProgramConfig('biz_1', {
        enabled: true,
        pointsPerCurrencyUnit: 1,
        redemptionValuePerPoint: 0.01,
        maxRedeemPercent: 30,
      })
    ).rejects.toThrow('no está disponible en modo demo');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('loyalty (modo real)', () => {
  beforeEach(() => {
    vi.mocked(isDemoMode).mockReturnValue(false);
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('getLoyaltyQuote llama al RPC get_loyalty_quote con los parametros correctos', async () => {
    rpcMock.mockResolvedValue({
      data: { availablePoints: 500, redeemablePoints: 500, maxDiscount: 5 },
      error: null,
    });

    const quote = await getLoyaltyQuote('biz_1', '0991234567', 20);

    expect(rpcMock).toHaveBeenCalledWith('get_loyalty_quote', {
      p_business_id: 'biz_1',
      p_phone: '0991234567',
      p_subtotal: 20,
    });
    expect(quote).toEqual({ availablePoints: 500, redeemablePoints: 500, maxDiscount: 5 });
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/__tests__/loyalty.test.ts`
Expected: FAIL — `Cannot find module '../loyalty'`.

- [ ] **Step 3: Implementación mínima**

Crear `src/lib/loyalty.ts`:

```typescript
import { isDemoMode } from '@/config/demo';
import { createClient } from '@/lib/supabase/client';
import { LoyaltyQuote, LoyaltyProgramConfig } from '@/types';

const DISABLED_QUOTE: LoyaltyQuote = { availablePoints: 0, redeemablePoints: 0, maxDiscount: 0 };

export async function getLoyaltyQuote(
  businessId: string,
  phone: string,
  subtotal: number
): Promise<LoyaltyQuote> {
  if (isDemoMode()) {
    return DISABLED_QUOTE;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_loyalty_quote', {
    p_business_id: businessId,
    p_phone: phone,
    p_subtotal: subtotal,
  });

  if (error || !data) {
    return DISABLED_QUOTE;
  }

  return {
    availablePoints: data.availablePoints ?? 0,
    redeemablePoints: data.redeemablePoints ?? 0,
    maxDiscount: data.maxDiscount ?? 0,
  };
}

export async function getLoyaltyProgramConfig(businessId: string): Promise<LoyaltyProgramConfig | null> {
  if (isDemoMode()) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('enabled, points_per_currency_unit, redemption_value_per_point, max_redeem_percent')
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    enabled: data.enabled,
    pointsPerCurrencyUnit: parseFloat(data.points_per_currency_unit),
    redemptionValuePerPoint: parseFloat(data.redemption_value_per_point),
    maxRedeemPercent: parseFloat(data.max_redeem_percent),
  };
}

export async function saveLoyaltyProgramConfig(businessId: string, config: LoyaltyProgramConfig): Promise<void> {
  if (isDemoMode()) {
    throw new Error('La configuración de fidelización no está disponible en modo demo.');
  }

  const supabase = createClient();
  const { error } = await supabase.from('loyalty_programs').upsert(
    {
      business_id: businessId,
      enabled: config.enabled,
      points_per_currency_unit: config.pointsPerCurrencyUnit,
      redemption_value_per_point: config.redemptionValuePerPoint,
      max_redeem_percent: config.maxRedeemPercent,
    },
    { onConflict: 'business_id' }
  );

  if (error) {
    throw new Error(error.message || 'No se pudo guardar la configuración de fidelización.');
  }
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/__tests__/loyalty.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/loyalty.ts src/lib/__tests__/loyalty.test.ts
git commit -m "feat(loyalty): cliente para cotizar/configurar fidelizacion con stub en modo demo"
```

---

## Task 9: Checkout — cotizar y canjear puntos

**Files:**
- Modify: `src/app/store/checkout/page.tsx`

**Interfaces:**
- Consumes: `getLoyaltyQuote` de `@/lib/loyalty` (Task 8), `LoyaltyQuote` de `@/types` (Task 7). `businessId` ya viene de `useApp()` (línea 55).
- Produces: el payload que recibe `OrderRepository.createOrderTransactional` (línea 346) incluye `redeemLoyaltyPoints`, consumido por `create_order` (Task 4).

- [ ] **Step 1: Agregar estado y el fetch de cotización**

En `src/app/store/checkout/page.tsx`, junto al resto de imports (después de línea 43):

```typescript
import { getLoyaltyQuote } from '@/lib/loyalty';
import { LoyaltyQuote } from '@/types';
```

Junto al estado de teléfono (después de línea 78 `const [phone, setPhone] = useState(...)`):

```typescript
  const [loyaltyQuote, setLoyaltyQuote] = useState<LoyaltyQuote>({
    availablePoints: 0,
    redeemablePoints: 0,
    maxDiscount: 0,
  });
  const [redeemPoints, setRedeemPoints] = useState(false);
```

- [ ] **Step 2: Disparar la cotización cuando el teléfono pierde el foco**

En el input de teléfono (línea 729-735), agregar `onBlur`:

```typescript
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          onBlur={async () => {
                            const digits = phone.replace(/\D/g, '');
                            if (digits.length < 7 || !businessId) {
                              setLoyaltyQuote({ availablePoints: 0, redeemablePoints: 0, maxDiscount: 0 });
                              return;
                            }
                            const quote = await getLoyaltyQuote(businessId, phone, cartSubtotal);
                            setLoyaltyQuote(quote);
                          }}
                          placeholder="Ej: 0991234567"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
```

Justo después del `</div>` que cierra el bloque de teléfono (después de línea 737), agregar el toggle de canje (solo visible si hay descuento disponible):

```typescript
                    {loyaltyQuote.maxDiscount > 0 && (
                      <label className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-xs sm:text-sm text-zinc-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={redeemPoints}
                          onChange={(e) => setRedeemPoints(e.target.checked)}
                          className="w-4 h-4 accent-amber-400"
                        />
                        <span>
                          Tenés <strong>{loyaltyQuote.redeemablePoints} puntos</strong> disponibles — aplicar{' '}
                          <strong>${loyaltyQuote.maxDiscount.toFixed(2)}</strong> de descuento
                        </span>
                      </label>
                    )}
```

- [ ] **Step 3: Ajustar el total y el payload**

Reemplazar la línea 180-181:

```typescript
  const currentDeliveryFee = deliveryMethod === 'delivery' ? deliveryFeeResult.fee : 0;
  const orderTotal = cartSubtotal + currentDeliveryFee;
```

por:

```typescript
  const currentDeliveryFee = deliveryMethod === 'delivery' ? deliveryFeeResult.fee : 0;
  const appliedLoyaltyDiscount = redeemPoints ? loyaltyQuote.maxDiscount : 0;
  const orderTotal = cartSubtotal - appliedLoyaltyDiscount + currentDeliveryFee;
```

En la construcción del payload (línea 341-343), agregar el campo nuevo:

```typescript
        subtotal: cartSubtotal,
        deliveryFee: currentDeliveryFee,
        total: orderTotal,
        redeemLoyaltyPoints: redeemPoints && loyaltyQuote.maxDiscount > 0,
      };
```

- [ ] **Step 4: Mostrar el descuento en el resumen de costos**

En el bloque de resumen (después de línea 1005, antes del `<div className="flex justify-between text-base font-black ...">` del Total a Pagar):

```typescript
                {appliedLoyaltyDiscount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Descuento por puntos</span>
                    <span className="font-semibold">-${appliedLoyaltyDiscount.toFixed(2)}</span>
                  </div>
                )}
```

- [ ] **Step 5: Verificación manual en el navegador (no hay test automatizado de UI en este repo para checkout)**

Levantar el dev server (`npm run dev`), ir a `/store/checkout` con un negocio real (no demo) que tenga `loyalty_programs.enabled = true` y un cliente con puntos:
1. Escribir el teléfono de ese cliente y salir del campo → debe aparecer el toggle con el monto correcto.
2. Tildar el toggle → el "Total a Pagar" debe bajar exactamente ese monto.
3. Confirmar el pedido → en `orders`, `discount_total`/`points_redeemed` deben coincidir con lo mostrado.
4. En modo demo (`NEXT_PUBLIC_DEMO_MODE=true`), el toggle nunca debe aparecer (la cotización siempre vuelve en cero).

- [ ] **Step 6: Commit**

```bash
git add src/app/store/checkout/page.tsx
git commit -m "feat(checkout): cotizar y canjear puntos de fidelizacion"
```

---

## Task 10: Panel admin — configurar el programa de fidelización

**Files:**
- Create: `src/app/admin/settings/loyalty/page.tsx`
- Create: `src/components/admin/SettingsLoyaltyClientPage.tsx`
- Modify: `src/components/admin/AdminLayout.tsx:6-26,39-53` (imports + `navItems`)

**Interfaces:**
- Consumes: `getLoyaltyProgramConfig`/`saveLoyaltyProgramConfig` de `@/lib/loyalty` (Task 8), `LoyaltyProgramConfig` de `@/types` (Task 7), `useApp()` para `businessId`/`isDemo` (mismo patrón que `SettingsBusinessClientPage.tsx`).

- [ ] **Step 1: Página del panel**

Crear `src/app/admin/settings/loyalty/page.tsx`:

```typescript
import SettingsLoyaltyClientPage from '@/components/admin/SettingsLoyaltyClientPage';

export const dynamic = 'force-dynamic';

export default function LoyaltySettingsPage() {
  return <SettingsLoyaltyClientPage />;
}
```

- [ ] **Step 2: Componente cliente**

Crear `src/components/admin/SettingsLoyaltyClientPage.tsx`:

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Gift } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { getLoyaltyProgramConfig, saveLoyaltyProgramConfig } from '@/lib/loyalty';
import { LoyaltyProgramConfig } from '@/types';

const DEFAULT_CONFIG: LoyaltyProgramConfig = {
  enabled: false,
  pointsPerCurrencyUnit: 1,
  redemptionValuePerPoint: 0.01,
  maxRedeemPercent: 30,
};

export default function SettingsLoyaltyClientPage() {
  const { businessId, isDemo } = useApp();
  const [config, setConfig] = useState<LoyaltyProgramConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isDemo || !businessId) return;
    getLoyaltyProgramConfig(businessId).then((loaded) => {
      if (loaded) setConfig(loaded);
    });
  }, [isDemo, businessId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      await saveLoyaltyProgramConfig(businessId, config);
      setMessage({ type: 'success', text: '✓ Configuración de fidelización guardada.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-extrabold text-white mb-1 flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          Fidelización de clientes
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          Tus clientes acumulan puntos por lo que gastan y los pueden canjear por descuento en un pedido futuro.
        </p>

        {isDemo ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-sm text-zinc-400 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>La fidelización no está disponible en modo demo. Conecta un negocio real para configurarla.</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <label className="flex items-center gap-2.5 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="w-4 h-4 accent-amber-400"
              />
              Activar programa de puntos
            </label>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Puntos por cada $1 gastado
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={config.pointsPerCurrencyUnit}
                onChange={(e) => setConfig({ ...config, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Valor de cada punto al canjear ($)
              </label>
              <input
                type="number"
                min={0}
                step={0.001}
                value={config.redemptionValuePerPoint}
                onChange={(e) => setConfig({ ...config, redemptionValuePerPoint: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Tope de canje (% del subtotal)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={config.maxRedeemPercent}
                onChange={(e) => setConfig({ ...config, maxRedeemPercent: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            {message && (
              <div
                className={`flex items-center gap-2 text-sm rounded-xl p-3 ${
                  message.type === 'success' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                }`}
              >
                {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-3 rounded-xl transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Link de navegación**

En `src/components/admin/AdminLayout.tsx`, agregar `Gift` al import de `lucide-react` (línea 15, junto a `Settings`):

```typescript
  Settings,
  Gift,
```

Y agregar la entrada al final de `navItems` (después de línea 52):

```typescript
  { href: '/admin/settings/business', label: 'Configuración Negocio', icon: Settings },
  { href: '/admin/settings/loyalty', label: 'Fidelización', icon: Gift },
```

- [ ] **Step 4: Verificación manual en el navegador**

Levantar el dev server, entrar como admin de un negocio real, ir a "Fidelización" en el menú: activar el programa, guardar, recargar la página y confirmar que los valores persistieron. En modo demo, confirmar que se ve el aviso de "no disponible" en vez del formulario.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/loyalty/page.tsx src/components/admin/SettingsLoyaltyClientPage.tsx src/components/admin/AdminLayout.tsx
git commit -m "feat(admin): panel de configuracion del programa de fidelizacion"
```

---

## Task 11: Mapear los campos nuevos al leer pedidos

**Files:**
- Modify: `src/repositories/supabase/SupabaseOrderRepository.ts:70-72`

**Interfaces:**
- Consumes: columnas `orders.discount_total`, `orders.points_redeemed`, `orders.points_earned` (Task 2).
- Produces: `Order.discountTotal`/`pointsRedeemed`/`pointsEarned` poblados en cualquier vista admin que liste pedidos (historial, detalle).

- [ ] **Step 1: Extender el mapeo**

En `src/repositories/supabase/SupabaseOrderRepository.ts`, reemplazar las líneas 70-72:

```typescript
        subtotal: parseFloat(o.subtotal),
        deliveryFee: parseFloat(o.delivery_fee),
        total: parseFloat(o.total),
```

por:

```typescript
        subtotal: parseFloat(o.subtotal),
        deliveryFee: parseFloat(o.delivery_fee),
        discountTotal: parseFloat(o.discount_total || 0),
        pointsRedeemed: o.points_redeemed || 0,
        pointsEarned: o.points_earned || 0,
        total: parseFloat(o.total),
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/repositories/supabase/SupabaseOrderRepository.ts
git commit -m "feat(orders): mapear discount_total/points_redeemed/points_earned al leer pedidos"
```

---

## Task 12: Script de verificación post-deploy

**Files:**
- Create: `scripts/test-supabase-loyalty.js`

**Interfaces:**
- Consumes: `@supabase/supabase-js`, `.env.production.local` (mismo patrón que `scripts/test-supabase-prod-rollback.js`).
- Produces: confirmación rápida de que las 3 tablas y las 2 RPCs nuevas existen y responden, antes de dar por buena la migración en producción.

- [ ] **Step 1: Escribir el script**

```javascript
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.production.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

console.log('--- TESTING LOYALTY OBJECTS EN SUPABASE ---');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  for (const table of ['loyalty_programs', 'loyalty_accounts', 'loyalty_transactions']) {
    const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ TABLA ${table}:`, error.message);
    } else {
      console.log(`✅ TABLA ${table} EXISTE (RLS bloqueando SELECT directo es esperado con anon key)`);
    }
  }

  const { data, error: quoteErr } = await supabase.rpc('get_loyalty_quote', {
    p_business_id: '00000000-0000-0000-0000-000000000000',
    p_phone: '0000000000',
    p_subtotal: 10,
  });

  if (quoteErr) {
    console.log('❌ RPC get_loyalty_quote:', quoteErr.message);
  } else {
    console.log('✅ RPC get_loyalty_quote responde:', JSON.stringify(data));
  }

  const { error: orderErr } = await supabase.rpc('create_order', { p_payload: null });
  if (orderErr && orderErr.message.includes('INVALID_PARAM')) {
    console.log('✅ RPC create_order (version con fidelizacion) responde con la validacion esperada.');
  } else {
    console.log('ℹ️ RPC create_order respuesta inesperada:', orderErr ? orderErr.message : data);
  }
}

runCheck();
```

- [ ] **Step 2: Correr contra producción DESPUÉS de aplicar las 6 migraciones SQL**

Run: `node scripts/test-supabase-loyalty.js`
Expected: las 3 tablas existen, `get_loyalty_quote` responde `{"availablePoints":0,"redeemablePoints":0,"maxDiscount":0}`, `create_order` responde con `INVALID_PARAM`.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-supabase-loyalty.js
git commit -m "chore: script de verificacion post-deploy para objetos de fidelizacion"
```

---

## Self-Review

**Cobertura del spec:**
- Modelo de datos (`loyalty_programs`/`loyalty_accounts`/`loyalty_transactions`, columnas en `orders`) → Tasks 1-2.
- Flujo de canje en checkout → Tasks 3-4, 9.
- Flujo de acreditación al entregar → Task 5.
- Reversa en rollback de `delivered` → Task 6.
- RLS por `business_id` → Task 1.
- Configuración por negocio → Tasks 7-8, 10.
- Riesgo de deriva de esquema → cubierto en Global Constraints y como paso previo al Task 1.

**Decisión de alcance tomada durante este plan (no estaba en el spec):** modo demo con stub simple (fidelización siempre deshabilitada, sin `DemoLoyaltyRepository` ni store en KV) — confirmado con el usuario antes de fijar el file structure.

**Nota de testing:** este repo no tiene un harness de pruebas automatizadas para las funciones SQL (los únicos ejemplos existentes, `deliveryQuote.test.ts`/`orderSupervision.test.ts`, prueban funciones TS puras con Vitest; la verificación de RPCs contra Supabase real se hace con scripts ad-hoc como `scripts/test-supabase-prod-rollback.js`). Los Tasks 1-6 y 12 siguen ese mismo patrón existente en vez de inventar uno nuevo.
