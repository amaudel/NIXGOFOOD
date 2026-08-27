-- ============================================================================
-- NIXGOFOOD: ELIMINAR OVERLOADS RPC OBSOLETOS Y SIN CHECK DE ROL
-- Existian dos funciones fantasma, creadas manualmente fuera de cualquier
-- migracion, con firmas distintas a las hardened (rollback_order_status/
-- verify_payment_status). El frontend (SupabaseOrderRepository.ts) solo llama
-- a las firmas ya endurecidas; estas dos overloads no las usa la app pero
-- seguian siendo invocables por cualquiera via RPC/REST directo:
--   - Si el usuario autenticado no tenia perfil, usaban un business_id
--     arbitrario (`SELECT id FROM businesses LIMIT 1`) en vez de denegar.
--   - No verificaban rol: cualquier autenticado podia verificar/rechazar
--     pagos, o revertir un pedido "delivered" a "on_the_way" sin ser
--     owner/admin.
-- ============================================================================

DROP FUNCTION IF EXISTS public.verify_payment_status(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.rollback_order_status(uuid, text);
