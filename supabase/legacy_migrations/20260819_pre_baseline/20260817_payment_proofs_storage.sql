-- Migration: Create private bucket payment-proofs and RLS policies

-- 1. Create payment-proofs storage bucket (STRICTLY PRIVATE)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false, -- PRIVATE BUCKET (NO PUBLIC READ ACCESS ALLOWED)
  5242880, -- 5 MB strict file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. RLS Policy: Allow upload to payment-proofs bucket for valid image extensions
DROP POLICY IF EXISTS "Allow public insert to payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow scoped upload to payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload to payment-proofs" ON storage.objects;

CREATE POLICY "Allow upload to payment-proofs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'payment-proofs' AND
  (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp'))
);

-- 3. RLS Policy: Restrict read access to authenticated restaurant users matching business_id folder (NO FALLBACKS)
DROP POLICY IF EXISTS "Allow authenticated read payment-proofs" ON storage.objects;
CREATE POLICY "Allow authenticated read payment-proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  (auth.jwt() ->> 'business_id') IS NOT NULL AND
  (storage.foldername(name))[1] = (auth.jwt() ->> 'business_id')
);

-- 4. RLS Policy: Allow authenticated delete for matching business_id folder (NO FALLBACKS)
DROP POLICY IF EXISTS "Allow authenticated delete payment-proofs" ON storage.objects;
CREATE POLICY "Allow authenticated delete payment-proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  (auth.jwt() ->> 'business_id') IS NOT NULL AND
  (storage.foldername(name))[1] = (auth.jwt() ->> 'business_id')
);
