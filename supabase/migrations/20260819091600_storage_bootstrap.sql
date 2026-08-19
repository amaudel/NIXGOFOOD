-- ============================================================================
-- NIXGOFOOD STORAGE BOOTSTRAP & POLICIES
-- Bucket: payment-proofs
-- Description: Idempotent initialization of payment-proofs bucket & storage RLS
-- ============================================================================

-- 1. IDEMPOTENT BUCKET CREATION
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. STORAGE OBJECT POLICIES FOR PAYMENT PROOFS
DO $$
BEGIN
    -- Allow public/guest checkout to upload payment proof into payment-proofs bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public/Guest order checkout upload payment proof'
    ) THEN
        CREATE POLICY "Public/Guest order checkout upload payment proof"
        ON storage.objects FOR INSERT
        TO public, anon, authenticated
        WITH CHECK (bucket_id = 'payment-proofs');
    END IF;

    -- Allow owner/admin/kitchen/dispatch staff to select payment proofs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Staff view payment proof'
    ) THEN
        CREATE POLICY "Staff view payment proof"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'payment-proofs' AND
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid() AND profiles.active = true
            )
        );
    END IF;
END $$;
