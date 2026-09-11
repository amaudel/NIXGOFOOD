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
  const { searchParams } = new URL(request.url);
  let slug = searchParams.get('slug');

  // El caller (la UI) ya tiene el slug de la llamada a /api/platform/businesses -
  // pasarlo evita esta consulta. Sin slug, se resuelve por id como respaldo (esta
  // consulta pasa por RLS vía el cliente autenticado normal; si el negocio está
  // inactivo y no es el propio del admin, RLS la bloquea - por eso el caller
  // SIEMPRE debe mandar el slug que ya tiene, este fallback es solo defensivo).
  if (!slug) {
    const supabase = await createClient();
    const { data: business, error } = await supabase.from('businesses').select('slug').eq('id', id).single();
    if (error || !business) {
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    }
    slug = business.slug;
  }

  try {
    const res = await fetch(`${AGENT_URL}/health-check?slug=${encodeURIComponent(slug!)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ ready: false, error: 'No se pudo conectar con el agente.' }, { status: 200 });
  }
}
