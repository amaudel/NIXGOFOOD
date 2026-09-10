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
    v_redeemable_points := LEAST(v_available_points::NUMERIC, pg_catalog.floor(v_max_discount_cap / v_redeem_value))::INT;
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
