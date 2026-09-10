-- ============================================================================
-- NIXGOFOOD: RPC get_loyalty_balance
-- Consulta el saldo de puntos de un telefono en un negocio, sin ningun tope
-- de canje ni subtotal de por medio -- a diferencia de get_loyalty_quote
-- (que es especifica del checkout y necesita un subtotal para calcular
-- cuanto se puede canjear EN ESE pedido), esta es para la pantalla "Mis
-- puntos": el cliente solo quiere saber cuanto tiene y cuanto vale en
-- total. Callable por anon, mismo nivel que get_loyalty_quote (no hay
-- login de cliente en esta app).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_loyalty_balance(
  p_business_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_redeem_value NUMERIC(10,4);
  v_customer_id UUID;
  v_available_points INT := 0;
  v_points_value NUMERIC(10,2) := 0;
BEGIN
  IF p_business_id IS NULL OR p_phone IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('availablePoints', 0, 'pointsValue', 0);
  END IF;

  SELECT enabled, redemption_value_per_point
  INTO v_enabled, v_redeem_value
  FROM public.loyalty_programs
  WHERE business_id = p_business_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('availablePoints', 0, 'pointsValue', 0);
  END IF;

  SELECT id INTO v_customer_id FROM public.customers
  WHERE business_id = p_business_id AND phone = pg_catalog.btrim(p_phone) LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    SELECT points_balance INTO v_available_points
    FROM public.loyalty_accounts
    WHERE business_id = p_business_id AND customer_id = v_customer_id;
  END IF;

  v_available_points := COALESCE(v_available_points, 0);
  v_points_value := pg_catalog.round(v_available_points * COALESCE(v_redeem_value, 0), 2);

  RETURN pg_catalog.jsonb_build_object(
    'availablePoints', v_available_points,
    'pointsValue', v_points_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_loyalty_balance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_balance(UUID, TEXT) TO anon, authenticated;
