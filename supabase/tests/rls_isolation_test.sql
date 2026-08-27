-- ============================================================================
-- NIXGOFOOD: PRUEBAS DE AISLAMIENTO MULTI-TENANT (pgTAP)
-- Ejecutar con: supabase test db
-- Requiere el stack local (`supabase start`) con las migraciones aplicadas.
-- ============================================================================

BEGIN;
SELECT plan(8);

-- Fixtures: dos negocios, un usuario admin por negocio, un pedido por negocio.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'owner-a@test.local', 'x', now(), 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'x', now(), 'authenticated', 'authenticated');

INSERT INTO public.businesses (id, name, slug, active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Negocio A', 'negocio-a', true),
  ('22222222-2222-2222-2222-222222222222', 'Negocio B', 'negocio-b', true);

INSERT INTO public.profiles (id, business_id, role, name, active)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'owner', 'Owner A', true),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'owner', 'Owner B', true);

INSERT INTO public.orders (id, business_id, status, delivery_method, payment_method, subtotal, delivery_fee, total, customer_name, customer_phone)
VALUES
  ('c0000000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111', 'new', 'pickup', 'cash', 10, 0, 10, 'Cliente A', '0999999999'),
  ('d0000000-0000-0000-0000-00000000000d', '22222222-2222-2222-2222-222222222222', 'new', 'pickup', 'cash', 20, 0, 20, 'Cliente B', '0988888888');

-- 1. Usuario A puede leer sus propios pedidos.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a"}';

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.orders WHERE id = 'c0000000-0000-0000-0000-00000000000c' $$,
  $$ VALUES (1) $$,
  'Usuario A puede leer su propio pedido'
);

-- 2. Usuario A NO puede leer pedidos del negocio B.
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.orders WHERE id = 'd0000000-0000-0000-0000-00000000000d' $$,
  $$ VALUES (0) $$,
  'Usuario A no puede leer pedidos del negocio B'
);

-- 3. Usuario A no puede insertar un producto con business_id de B.
SELECT throws_ok(
  $$ INSERT INTO public.products (business_id, category_id, name, price, active, available)
     VALUES ('22222222-2222-2222-2222-222222222222', NULL, 'Producto Intruso', 5.00, true, true) $$,
  '42501',
  NULL,
  'Usuario A no puede insertar producto usando business_id de B (RLS deniega INSERT)'
);

-- 4. Usuario A no puede actualizar (mover) un branch propio hacia el negocio B.
INSERT INTO public.branches (id, business_id, name, address, latitude, longitude, active)
VALUES ('e0000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111', 'Sucursal A', 'Dir A', 0, 0, true);

SELECT throws_ok(
  $$ UPDATE public.branches SET business_id = '22222222-2222-2222-2222-222222222222'
     WHERE id = 'e0000000-0000-0000-0000-00000000000e' $$,
  '42501',
  NULL,
  'Usuario A no puede reasignar una sucursal propia al negocio B (WITH CHECK deniega)'
);

-- 5. Usuario A no puede modificar directamente un pedido del negocio B (UPDATE revocado).
SELECT throws_ok(
  $$ UPDATE public.orders SET status = 'cancelled' WHERE id = 'd0000000-0000-0000-0000-00000000000d' $$,
  '42501',
  NULL,
  'Usuario A no puede hacer UPDATE directo sobre pedidos (privilegio revocado a nivel de tabla)'
);

-- 6. Usuario A no puede eliminar un pedido del negocio B.
SELECT throws_ok(
  $$ DELETE FROM public.orders WHERE id = 'd0000000-0000-0000-0000-00000000000d' $$,
  '42501',
  NULL,
  'Usuario A no puede hacer DELETE sobre pedidos (sin policy de DELETE, denegado por defecto)'
);

-- 7. Usuario A (role owner, no admin de plataforma) no puede ejecutar acciones de otro negocio via RPC.
SELECT throws_ok(
  $$ SELECT public.transition_order_status('d0000000-0000-0000-0000-00000000000d', 'KITCHEN_START', NULL) $$,
  'P0001',
  'NOT_FOUND: Pedido no existe o pertenece a otro negocio.',
  'RPC transition_order_status no permite operar sobre pedido de otro negocio'
);

-- 8. Usuario autenticado SIN perfil (simulando cuenta recien registrada) no escala a owner via RPC.
SET LOCAL request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b"}';
DELETE FROM public.profiles WHERE id = 'b0000000-0000-0000-0000-00000000000b';

SELECT throws_ok(
  $$ SELECT public.transition_order_status('c0000000-0000-0000-0000-00000000000c', 'KITCHEN_START', NULL) $$,
  'P0001',
  'PERMISSION_DENIED: No tienes un perfil administrativo activo asignado a un negocio.',
  'Usuario autenticado sin perfil no se auto-provisiona como owner (backdoor cerrado)'
);

SELECT * FROM finish();
ROLLBACK;
