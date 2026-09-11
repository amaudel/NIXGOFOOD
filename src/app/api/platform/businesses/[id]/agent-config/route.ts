import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as { agentPersona: string | null; agentFaq: string | null };

  const supabase = await createClient();
  const { error } = await supabase.rpc('platform_update_agent_config', {
    p_business_id: id,
    p_persona: body.agentPersona,
    p_faq: body.agentFaq,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
