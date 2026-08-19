import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/config/demo';
import { DemoOrderRepository } from '@/repositories/demo/DemoOrderRepository';
import { verifyAdminSession } from '@/lib/auth/adminAuth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'ID de pedido no proporcionado.' }, { status: 400 });
    }

    if (isDemoMode()) {
      const demoOrder = await DemoOrderRepository.getOrderByTrackingToken(orderId);
      if (!demoOrder) {
        return NextResponse.json({ error: 'Pedido demo no encontrado.' }, { status: 404 });
      }
      return NextResponse.json({
        signedUrl: demoOrder.transferDetails?.proofUrl || null,
      });
    }

    // 1. Enforce Server-Side Administrative Session & Business Ownership Verification
    const authResult = await verifyAdminSession();
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error || 'Acceso no autorizado.' },
        { status: authResult.status }
      );
    }

    const businessId = authResult.businessId!;
    const supabase = await createClient();

    // 2. Fetch order strictly filtering by business_id to prevent cross-restaurant data leaks
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, transfer_details')
      .eq('id', orderId)
      .eq('business_id', businessId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Pedido no encontrado o no pertenece a este negocio.' },
        { status: 403 }
      );
    }

    const proofPath = order.transfer_details?.proofPath;
    if (!proofPath) {
      return NextResponse.json({ error: 'El pedido no tiene un comprobante registrado.' }, { status: 404 });
    }

    // 3. Generate short-lived Signed URL (300 s / 5 min)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(proofPath, 300);

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL generation error:', signedError);
      return NextResponse.json({ error: signedError?.message || 'Error al generar la URL firmada.' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: signedData.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
