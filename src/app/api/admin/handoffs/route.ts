import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAdminSession } from '@/lib/auth/adminAuth';

export async function GET() {
  try {
    const auth = await verifyAdminSession();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.status });
    }

    const businessId = auth.businessId!;
    const supabase = await createClient();

    const { data: handoffs, error } = await supabase
      .from('agent_handoffs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error al obtener handoffs de atención humana:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ handoffs: handoffs || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.status });
    }

    const body = await request.json();
    const { handoffId, action, replyText, pausedAi } = body;

    if (!handoffId) {
      return NextResponse.json({ error: 'handoffId requerido.' }, { status: 400 });
    }

    const businessId = auth.businessId!;
    const supabase = await createClient();

    // Verify handoff belongs to business
    const { data: existingHandoff, error: fetchErr } = await supabase
      .from('agent_handoffs')
      .select('*')
      .eq('id', handoffId)
      .eq('business_id', businessId)
      .single();

    if (fetchErr || !existingHandoff) {
      return NextResponse.json({ error: 'Solicitud no encontrada o no autorizada.' }, { status: 404 });
    }

    if (action === 'toggle_ai') {
      const { error: updateErr } = await supabase
        .from('agent_handoffs')
        .update({
          paused_ai: Boolean(pausedAi),
          status: pausedAi ? 'in_progress' : 'resolved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, pausedAi: Boolean(pausedAi) });
    }

    if (action === 'resolve') {
      const { error: updateErr } = await supabase
        .from('agent_handoffs')
        .update({
          status: 'resolved',
          paused_ai: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: 'resolved' });
    }

    if (action === 'reply') {
      if (!replyText || typeof replyText !== 'string') {
        return NextResponse.json({ error: 'replyText requerido' }, { status: 400 });
      }

      // If channel is telegram, deliver directly via Telegram Bot API
      if (existingHandoff.channel === 'telegram') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: existingHandoff.chat_id,
              text: `👤 *Respuesta del Administrador:*\n${replyText}`,
              parse_mode: 'Markdown',
            }),
          });

          if (!telegramRes.ok) {
            console.error('Error enviando mensaje a Telegram:', await telegramRes.text());
          }
        }
      }

      const { error: updateErr } = await supabase
        .from('agent_handoffs')
        .update({
          last_message: `Operador: ${replyText}`,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
