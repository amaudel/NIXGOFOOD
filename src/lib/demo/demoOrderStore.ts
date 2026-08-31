import { Order } from '@/types';
import { demoInitialOrders } from '@/data/demoSeed';
import { ORDER_TRANSITION_RULES } from '@/lib/orderTransitions';
import { ExecuteActionParams, RollbackParams } from '@/repositories/interfaces/IOrderRepository';

// Guarda los pedidos de demo en Vercel KV (Redis) en vez de localStorage.
// localStorage es por-origen: con el storefront en {slug}.{root} y el admin
// en admin.{root}, cada uno tiene su propio storage aislado, asi que un
// pedido creado en la tienda nunca aparecia del lado del admin. KV es
// compartido por todos los origenes -- un solo array JSON con TODOS los
// pedidos demo (de cualquier negocio), filtrado por businessId al leer.
const KV_KEY = 'demo:orders:v1';

function getKvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function readAllOrders(): Promise<Order[]> {
  const kv = getKvConfig();
  if (!kv) return demoInitialOrders;

  try {
    const res = await fetch(`${kv.url}/get/${KV_KEY}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return demoInitialOrders;
    return JSON.parse(data.result) as Order[];
  } catch (e) {
    console.error('demoOrderStore: fallo leyendo KV, usando seed inicial', e);
    return demoInitialOrders;
  }
}

async function writeAllOrders(orders: Order[]): Promise<void> {
  const kv = getKvConfig();
  if (!kv) return;

  await fetch(`${kv.url}/set/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kv.token}` },
    body: JSON.stringify(orders),
  });
}

export async function getAllOrders(): Promise<Order[]> {
  return readAllOrders();
}

export async function getOrdersForBusiness(businessId: string): Promise<Order[]> {
  const all = await readAllOrders();
  return all.filter((o) => o.businessId === businessId);
}

export async function getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
  const all = await readAllOrders();
  return all.find((o) => o.trackingToken === trackingToken) || null;
}

export async function createDemoOrder(payload: any): Promise<any> {
  const all = await readAllOrders();
  const businessId = payload.businessId || 'b0000000-0000-0000-0000-000000000001';
  const businessOrders = all.filter((o) => o.businessId === businessId);

  let maxNum = 1050;
  businessOrders.forEach((o) => {
    const num = parseInt(o.orderNumber.replace('#', ''), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  const nextOrderNumber = `#${maxNum + 1}`;
  const trackingToken = `trk_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const orderId = `ord_demo_${Date.now()}`;

  const items = (payload.items || []).map((it: any, idx: number) => ({
    id: `oi_demo_${idx}_${Date.now()}`,
    productId: it.productId,
    productName: it.productName || 'Producto Demo',
    unitPrice: it.unitPrice || 3.5,
    quantity: it.quantity,
    selectedModifiers: it.selectedModifiers || [],
    notes: it.notes || '',
    totalPrice: (it.unitPrice || 3.5) * it.quantity,
  }));

  const subtotal = payload.subtotal || items.reduce((sum: number, i: any) => sum + i.totalPrice, 0);
  const deliveryFee = payload.deliveryMethod === 'delivery' ? (payload.deliveryFee || 1.5) : 0.0;
  const total = subtotal + deliveryFee;

  const newOrder: Order = {
    id: orderId,
    orderNumber: nextOrderNumber,
    trackingToken,
    businessId,
    branchId: payload.branchId || 'b0000000-0000-0000-0000-000000000002',
    customer: payload.customer || { name: 'Cliente Demo', phone: '0991234567' },
    deliveryMethod: payload.deliveryMethod || 'delivery',
    deliveryLocation: payload.deliveryLocation || undefined,
    paymentMethod: payload.paymentMethod || 'cash',
    cashChange: payload.cashChange || undefined,
    transferDetails:
      payload.paymentMethod === 'transfer' && payload.transferDetails
        ? { verificationStatus: 'pending', ...payload.transferDetails }
        : undefined,
    items,
    subtotal,
    deliveryFee,
    total,
    status: 'new',
    createdAt: new Date().toISOString(),
    estimatedTime: payload.deliveryMethod === 'delivery' ? '20-30 min' : '15-20 min',
    notes: payload.notes || '',
  };

  all.unshift(newOrder);
  await writeAllOrders(all);

  return {
    id: orderId,
    orderNumber: nextOrderNumber,
    trackingToken,
    subtotal,
    deliveryFee,
    total,
    status: 'new',
    estimatedTime: newOrder.estimatedTime,
    createdAt: newOrder.createdAt,
  };
}

export async function executeDemoOrderAction(params: ExecuteActionParams): Promise<void> {
  const rule = ORDER_TRANSITION_RULES[params.action];
  if (!rule) {
    throw new Error(`Acción de pedido inválida: ${params.action}`);
  }

  const all = await readAllOrders();
  const currentOrder = all.find((o) => o.id === params.orderId);
  if (!currentOrder) {
    throw new Error(`No se encontró el pedido ${params.orderId} en Demo.`);
  }

  if (currentOrder.status !== params.expectedFromStatus) {
    throw new Error(
      `CONCURRENCY_ERROR: El pedido cambió de estado desde otro dispositivo. (Esperado: ${params.expectedFromStatus}, Actual: ${currentOrder.status})`
    );
  }

  if (params.action === 'DISPATCH_DELIVERY' && currentOrder.deliveryMethod !== 'delivery') {
    throw new Error('INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con entrega a domicilio (Delivery).');
  }
  if (params.action === 'DISPATCH_PICKUP' && currentOrder.deliveryMethod !== 'pickup') {
    throw new Error('INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con retiro en local (Pickup).');
  }
  if (params.action === 'DISPATCH_CONFIRM_DELIVERY' && currentOrder.deliveryMethod !== 'delivery') {
    throw new Error('INVALID_DELIVERY_METHOD: Confirmación de entrega aplica únicamente a pedidos con Delivery.');
  }

  if (['KITCHEN_START', 'DISPATCH_DELIVERY', 'DISPATCH_PICKUP'].includes(params.action)) {
    const isCash = currentOrder.paymentMethod === 'cash';
    const isVerified = currentOrder.transferDetails?.verificationStatus === 'verified';
    if (!isCash && !isVerified) {
      if (params.action === 'KITCHEN_START') {
        throw new Error('PAYMENT_NOT_VERIFIED: No se puede empezar la preparación de un pedido con pago por transferencia sin verificar.');
      }
      throw new Error('PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.');
    }
  }

  if (params.action === 'ADMIN_CANCEL') {
    if (!params.reason || params.reason.trim().length < 3) {
      throw new Error('REASON_REQUIRED: Motivo obligatorio para cancelar el pedido.');
    }
    if (['delivered', 'cancelled'].includes(currentOrder.status)) {
      throw new Error('INVALID_TRANSITION: Un pedido entregado o cancelado no se puede cancelar.');
    }
  }

  const targetStatus = rule.targetStatus;
  const updated = all.map((o) => (o.id === params.orderId ? { ...o, status: targetStatus } : o));
  await writeAllOrders(updated);
}

export async function rollbackDemoOrderStatus(params: RollbackParams): Promise<void> {
  const all = await readAllOrders();
  const currentOrder = all.find((o) => o.id === params.orderId);
  if (!currentOrder) {
    throw new Error('No se encontró el pedido para revertir en Demo.');
  }
  if (currentOrder.status !== params.expectedCurrentStatus) {
    throw new Error(
      `CONCURRENCY_ERROR: El pedido cambió de estado desde otro dispositivo. Estado actual: ${currentOrder.status}`
    );
  }
  const updated = all.map((o) => (o.id === params.orderId ? { ...o, status: params.targetStatus } : o));
  await writeAllOrders(updated);
}

export async function updateDemoPaymentVerification(
  orderId: string,
  verificationStatus: 'verified' | 'rejected'
): Promise<void> {
  const all = await readAllOrders();
  const updated = all.map((o) => {
    if (o.id === orderId && o.transferDetails) {
      return { ...o, transferDetails: { ...o.transferDetails, verificationStatus } };
    }
    return o;
  });
  await writeAllOrders(updated);
}

export async function resetDemoOrdersForBusiness(businessId: string): Promise<void> {
  const all = await readAllOrders();
  const kept = all.filter((o) => o.businessId !== businessId);
  const seedForBusiness = demoInitialOrders.filter((o) => o.businessId === businessId);
  await writeAllOrders([...seedForBusiness, ...kept]);
}
