import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAdminSession } from '@/lib/auth/adminAuth';

export async function POST(request: Request) {
  try {
    const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

    // 1. Verify Authorization (Admin Session or Cron Secret)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.HANDOFF_CLEANUP_SECRET;

    let isAuthorized = false;
    let businessIdFilter: string | null = null;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    } else {
      const auth = await verifyAdminSession();
      if (auth.authorized) {
        isAuthorized = true;
        businessIdFilter = auth.businessId || null;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Acceso no autorizado para ejecutar la limpieza de atención en vivo.' },
        { status: 401 }
      );
    }

    const supabase = createServiceRoleClient();

    // 2. Build deletion query
    let query = supabase
      .from('agent_handoffs')
      .delete({ count: 'exact' })
      .eq('status', 'resolved')
      .eq('paused_ai', false)
      .lt('updated_at', cutoffDate.toISOString());

    if (businessIdFilter) {
      query = query.eq('business_id', businessIdFilter);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error al limpiar handoffs resueltos de 14 días:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      cleanedCount: count || 0,
      message: `Se depuraron exitosamente ${count || 0} chats resueltos de más de 14 días.`,
    });
  } catch (err: any) {
    console.error('Error interno en cleanup-handoffs:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
