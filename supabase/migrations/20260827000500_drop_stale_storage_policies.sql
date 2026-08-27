-- ============================================================================
-- NIXGOFOOD: ELIMINAR POLICIES DE STORAGE FANTASMA (payment-proofs)
-- Creadas manualmente desde el Dashboard, fuera de cualquier migracion:
--   - "Allow upload to payment-proofs" (INSERT, rol public): solo validaba
--     bucket_id + extension, sin restringir carpeta/business_id -> cualquiera
--     podia subir archivos a la carpeta de OTRO negocio via REST directo.
--   - "Allow authenticated read/delete payment-proofs": filtraban por
--     auth.jwt() ->> 'business_id', un claim que no genera ningun hook
--     confiable en este proyecto (uso inseguro de user_metadata si viniera de
--     ahi) y que es redundante/inferior a "Staff view payment proof" (ya
--     usa profiles via current_user_business_id(), fuente confiable).
-- La subida real pasa por /api/payment-proof/upload con service_role
-- (bypassa RLS), asi que ninguna de estas policies es necesaria para el flujo
-- legitimo.
-- ============================================================================

DROP POLICY IF EXISTS "Allow upload to payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete payment-proofs" ON storage.objects;
