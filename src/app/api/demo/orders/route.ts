import { NextResponse } from 'next/server';
import { isDemoMode } from '@/config/demo';
import {
  getOrdersForBusiness,
  getAllOrders,
  getOrderByTrackingToken,
  createDemoOrder,
  executeDemoOrderAction,
  rollbackDemoOrderStatus,
  updateDemoPaymentVerification,
  resetDemoOrdersForBusiness,
} from '@/lib/demo/demoOrderStore';

// Unico punto de entrada HTTP para los pedidos de demo, usado por el
// storefront y el admin en subdominios distintos -- ver comentario en
// demoOrderStore.ts sobre por que esto no puede vivir en localStorage.
// Fuera de modo demo esta ruta no hace nada (protege contra tocar KV en
// produccion real).

export async function GET(request: Request) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Not in demo mode' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('businessId');
  const trackingToken = searchParams.get('trackingToken');
  const all = searchParams.get('all');

  if (trackingToken) {
    const order = await getOrderByTrackingToken(trackingToken);
    return NextResponse.json({ order });
  }

  if (all) {
    const orders = await getAllOrders();
    return NextResponse.json({ orders });
  }

  if (!businessId) {
    return NextResponse.json({ error: 'businessId requerido' }, { status: 400 });
  }

  const orders = await getOrdersForBusiness(businessId);
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Not in demo mode' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { type } = body;

    switch (type) {
      case 'CREATE': {
        const result = await createDemoOrder(body.payload);
        return NextResponse.json({ result });
      }
      case 'EXECUTE_ACTION': {
        await executeDemoOrderAction(body.params);
        return NextResponse.json({ ok: true });
      }
      case 'ROLLBACK': {
        await rollbackDemoOrderStatus(body.params);
        return NextResponse.json({ ok: true });
      }
      case 'VERIFY_PAYMENT': {
        await updateDemoPaymentVerification(body.orderId, body.verificationStatus);
        return NextResponse.json({ ok: true });
      }
      case 'RESET': {
        await resetDemoOrdersForBusiness(body.businessId);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: `Tipo de operación desconocido: ${type}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error procesando el pedido demo' }, { status: 400 });
  }
}
