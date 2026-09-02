import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { getResolvedBusinessId } from '@/lib/tenant';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';

// Proxy server-a-servidor hacia el Worker del agente. El navegador le habla
// a esta ruta (mismo origen, sin CORS); esta ruta es la única que le habla
// directo a *.workers.dev, evitando el bloqueo anti-bots que Cloudflare
// aplica a peticiones fetch() de navegador hacia ese dominio compartido.
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimit(clientIp, 20, 60000, 'agent_chat');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Demasiados mensajes. Reintenta en ${rateCheck.resetSeconds} segundos.` },
        { status: 429, headers: { 'Retry-After': String(rateCheck.resetSeconds) } }
      );
    }

    if (!AGENT_URL) {
      return NextResponse.json({ error: 'Chat no disponible.' }, { status: 503 });
    }

    const businessId = await getResolvedBusinessId();
    if (!businessId) {
      return NextResponse.json({ error: 'No se pudo resolver el negocio.' }, { status: 400 });
    }

    const body = await request.json();

    const agentRes = await fetch(`${AGENT_URL}/web-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, businessId }),
    });

    const data = await agentRes.json();
    return NextResponse.json(data, { status: agentRes.status });
  } catch (err: any) {
    console.error('agent-chat proxy error:', err);
    return NextResponse.json(
      { messages: [{ type: 'text', text: '⚠️ No se pudo conectar con el asistente. Intenta de nuevo.' }] },
      { status: 200 }
    );
  }
}
