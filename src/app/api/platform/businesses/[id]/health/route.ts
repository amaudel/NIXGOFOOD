import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!AGENT_URL) {
    return NextResponse.json({ error: 'Agente no disponible.' }, { status: 503 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: business, error } = await supabase.from('businesses').select('slug').eq('id', id).single();

  if (error || !business) {
    return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }

  try {
    const res = await fetch(`${AGENT_URL}/health-check?slug=${encodeURIComponent(business.slug)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ ready: false, error: 'No se pudo conectar con el agente.' }, { status: 200 });
  }
}
