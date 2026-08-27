-- ============================================================================
-- NIXGOFOOD: REVOCAR TRUNCATE/TRIGGER DE anon/authenticated
-- TRUNCATE ignora RLS por completo (no es filtrado por policies como
-- DELETE/UPDATE/SELECT); information_schema.role_table_grants mostro que
-- `authenticated` tenia TRUNCATE y TRIGGER sobre public.orders (privilegios
-- por defecto de Supabase sobre tablas nuevas, nunca revocados). Cualquier
-- usuario autenticado de cualquier negocio podia vaciar tablas completas
-- (orders, products, customers, etc.) sin pasar por ninguna policy.
-- ============================================================================

REVOKE TRUNCATE, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Evitar que se repita en tablas futuras creadas por el rol de migraciones.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER ON TABLES FROM anon, authenticated;
