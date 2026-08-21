-- ============================================================================
-- NIXGOFOOD: fix verify_payment_status — pg_catalog.trim(text) does not exist
-- Description: The previous migration schema-qualified trim() as pg_catalog.trim,
--   but Postgres only exposes TRIM as special SQL-standard grammar (unqualified
--   `trim(x)`) or as the real underlying function `pg_catalog.btrim(x)`. Because
--   this function sets search_path = '', every call must be schema-qualified,
--   so pg_catalog.trim(text) fails with "function does not exist". Replaces it
--   with pg_catalog.btrim(text), which is the actual function TRIM resolves to.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_payment_status(
  p_order_id UUID,
  p_verification_status TEXT,
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
  v_current_details JSONB;
  v_current_status TEXT;
  v_updated_details JSONB;
BEGIN
  IF p_order_id IS NULL OR p_verification_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAM: p_order_id y p_verification_status son obligatorios.';
  END IF;

  -- Autenticación e Identidad del usuario servidor (JWT Real)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sesión requerida para verificar comprobante de pago.';
  END IF;

  SELECT role, business_id, name INTO v_role, v_business_id, v_user_name
  FROM public.profiles
  WHERE id = v_user_id AND active = true;

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo administradores o propietarios pueden verificar o rechazar pagos.';
  END IF;

  IF p_verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_PARAM: Estado de verificación no válido (%s). Usar verified o rejected.', p_verification_status;
  END IF;

  SELECT transfer_details INTO v_current_details
  FROM public.orders
  WHERE id = p_order_id AND business_id = v_business_id;

  IF v_current_details IS NULL THEN
    v_current_details := '{}'::jsonb;
  END IF;

  v_current_status := COALESCE(v_current_details->>'verificationStatus', 'pending');

  -- Validación de Motivo Obligatorio para Correcciones Administrativas (verified <-> rejected)
  IF (v_current_status = 'verified' AND p_verification_status = 'rejected') OR
     (v_current_status = 'rejected' AND p_verification_status = 'verified') THEN
    IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'REASON_REQUIRED: Motivo obligatorio (mínimo 3 caracteres) para corregir la verificación de pago previa.';
    END IF;
  END IF;

  v_updated_details := v_current_details || pg_catalog.jsonb_build_object(
    'verificationStatus', p_verification_status,
    'verifiedBy', v_user_name,
    'verifiedAt', pg_catalog.now()
  );

  IF p_reason IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_reason)) >= 3 THEN
    v_updated_details := v_updated_details || pg_catalog.jsonb_build_object('verificationReason', pg_catalog.btrim(p_reason));
  END IF;

  UPDATE public.orders
  SET transfer_details = v_updated_details,
      updated_at = pg_catalog.now()
  WHERE id = p_order_id AND business_id = v_business_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'from_verification', v_current_status,
    'to_verification', p_verification_status,
    'verifiedBy', v_user_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_status(UUID, TEXT, TEXT) TO authenticated;
