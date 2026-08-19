import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/config/demo';
import { DemoOrderRepository } from '@/repositories/demo/DemoOrderRepository';
import { verifyAdminSession } from '@/lib/auth/adminAuth';

export async function POST(request: Request) {
  try {
    const { orderId, status, reason } = await request.json();

    if (!orderId || !status || !['verified', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Parámetros de verificación no válidos.' }, { status: 400 });
    }

    if (isDemoMode()) {
      await DemoOrderRepository.updatePaymentVerificationStatus(orderId, status as any);
      return NextResponse.json({ success: true });
    }

    // 1. Enforce Server-Side Administrative Session & Business Ownership Verification
    const authResult = await verifyAdminSession();
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error || 'Acceso no autorizado.' },
        { status: authResult.status }
      );
    }

    // 2. Create Server-Side Supabase Client reusing User's Cookie/JWT Session
    const supabase = await createClient();

    // 3. Call Server-Side RPC verify_payment_status preserving User's auth.uid() Identity
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_payment_status', {
      p_order_id: orderId,
      p_verification_status: status,
      p_reason: reason || null,
    });

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, details: rpcRes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en servidor.' }, { status: 500 });
  }
}
