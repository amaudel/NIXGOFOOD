-- Rol de plataforma: ve/gestiona TODOS los negocios, independiente del rol
-- por negocio que un perfil ya tenga (o no tenga - business_id puede ser
-- NULL). Mismo estilo exacto que current_user_business_id()/
-- current_user_role() en 20260827000000_rls_hardening.sql.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_platform_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.platform_list_businesses()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_since TIMESTAMPTZ := now() - INTERVAL '7 days';
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'active', b.active,
      'agentPersona', b.agent_persona, 'agentFaq', b.agent_faq,
      'ordersLast7d', (SELECT count(*) FROM public.orders o WHERE o.business_id = b.id AND o.created_at >= v_since),
      'reservationsLast7d', (SELECT count(*) FROM public.reservations r WHERE r.business_id = b.id AND r.created_at >= v_since)
    ))
    FROM public.businesses b
    ORDER BY b.name
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_agent_config(p_business_id UUID, p_persona TEXT, p_faq TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  UPDATE public.businesses SET agent_persona = NULLIF(p_persona, ''), agent_faq = NULLIF(p_faq, '') WHERE id = p_business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_businesses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_businesses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) FROM PUBLIC, anon;
