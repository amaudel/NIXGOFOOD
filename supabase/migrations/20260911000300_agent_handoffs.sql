-- Migración: Módulo de Atención Humana (Human Handoff) para agentes de IA
CREATE TABLE IF NOT EXISTS public.agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  customer_name TEXT,
  last_message TEXT,
  operator_reply TEXT,
  operator_reply_delivered BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'resolved'
  paused_ai BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_handoffs ADD COLUMN IF NOT EXISTS operator_reply TEXT;
ALTER TABLE public.agent_handoffs ADD COLUMN IF NOT EXISTS operator_reply_delivered BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_handoffs_business_status ON public.agent_handoffs(business_id, status);

ALTER TABLE public.agent_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read business agent_handoffs" ON public.agent_handoffs;
CREATE POLICY "Admin read business agent_handoffs" ON public.agent_handoffs
  FOR SELECT TO authenticated
  USING (
    business_id = public.current_user_business_id() OR public.current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS "Admin write business agent_handoffs" ON public.agent_handoffs;
CREATE POLICY "Admin write business agent_handoffs" ON public.agent_handoffs
  FOR ALL TO authenticated
  USING (
    business_id = public.current_user_business_id() OR public.current_user_is_platform_admin()
  );
