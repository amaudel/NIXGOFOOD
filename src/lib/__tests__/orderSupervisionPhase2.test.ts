import { it } from 'vitest';
import { Order, OrderStatusHistoryItem } from '@/types';
import { getOrderSupervisionState } from '../orderSupervision';

const now = new Date('2026-08-18T12:00:00.000Z');

function createMockOrder(overrides: Partial<Order>): Order {
  return {
    id: 'ord_1',
    orderNumber: '#1001',
    trackingToken: 'token123',
    businessId: 'b1',
    branchId: 'br1',
    customer: { id: 'c1', name: 'John Doe', phone: '0991234567' },
    deliveryMethod: 'delivery',
    paymentMethod: 'cash',
    items: [],
    subtotal: 10,
    deliveryFee: 2,
    total: 12,
    status: 'new',
    createdAt: '2026-08-18T12:00:00.000Z',
    estimatedTime: '25-35 min',
    ...overrides,
  };
}

function minAgo(mins: number): string {
  return new Date(now.getTime() - mins * 60000).toISOString();
}

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual !== expected) {
    throw new Error(`FAIL [${testName}]: Expected "${expected}", got "${actual}"`);
  }
  console.log(`✓ PASS: ${testName}`);
}

function runPhase2Tests() {
  console.log("=== RUNNING PHASE 2 VISUAL SUPERVISION TESTS ===\n");

  // Test 1 & 5: Normal order excluded from Attention Block
  {
    const o1 = createMockOrder({ id: 'o1', status: 'new', createdAt: minAgo(2) });
    const sup1 = getOrderSupervisionState(o1, now);
    const list = [sup1].filter((s) => s.severity !== 'normal');
    assertEqual(list.length, 0, '1. Bloque atención oculto cuando count = 0 (Normal excluido)');
  }

  // Test 2, 3, 4, 9, 10, 11, 12, 13: Attention list contains Warning & Critical items
  {
    const o1 = createMockOrder({ id: 'o1', orderNumber: '#1001', status: 'new', createdAt: minAgo(10) }); // warning
    const o2 = createMockOrder({ id: 'o2', orderNumber: '#1002', status: 'preparing', createdAt: minAgo(30) }); // critical (history fallback: 30m)
    const o3 = createMockOrder({
      id: 'o3',
      orderNumber: '#1003',
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'rejected' },
      createdAt: minAgo(2),
    }); // critical payment_rejected

    const history2: OrderStatusHistoryItem[] = [
      { id: 'h2', orderId: 'o2', businessId: 'b1', fromStatus: 'new', toStatus: 'preparing', isRollback: false, createdAt: minAgo(30) },
    ];

    const rawList = [
      { order: o1, supervision: getOrderSupervisionState(o1, now) },
      { order: o2, supervision: getOrderSupervisionState(o2, now, history2) },
      { order: o3, supervision: getOrderSupervisionState(o3, now) },
    ];

    const attList = rawList.filter((item) => item.supervision.severity !== 'normal');
    assertEqual(attList.length, 3, '2. Contador atención correcto (3 items)');

    attList.sort((a, b) => {
      if (a.supervision.severity !== b.supervision.severity) {
        return a.supervision.severity === 'critical' ? -1 : 1;
      }
      return b.supervision.elapsedMinutes - a.supervision.elapsedMinutes;
    });

    // Test 6 & 7: Critical sorted before Warning
    assertEqual(attList[0].supervision.severity, 'critical', '6. Critical primero en ordenamiento');
    assertEqual(attList[1].supervision.severity, 'critical', '6. Critical primero (o2/o3)');
    assertEqual(attList[2].supervision.severity, 'warning', '7. Warning después de critical');

    // Test 8: Within same severity, longest elapsed minutes first
    assertEqual(attList[0].order.id, 'o2', '8. Mayor elapsed (30m) primero dentro de critical');
    assertEqual(attList[1].order.id, 'o3', '8. Menor elapsed (2m) segundo dentro de critical');
  }

  // Test 22: Payment verified removes alert
  {
    const oVerified = createMockOrder({
      id: 'ov',
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'verified' },
      createdAt: minAgo(15),
    });
    const sup = getOrderSupervisionState(oVerified, now);
    assertEqual(sup.type, 'new_delay', '22. Verified removes payment alert, leaving only status delay');
  }

  // Test 23: Preparing -> Ready changes alert type
  {
    const oReady = createMockOrder({ id: 'or', status: 'ready', createdAt: minAgo(20) });
    const histReady: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'or', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(12) },
    ];
    const supReady = getOrderSupervisionState(oReady, now, histReady);
    assertEqual(supReady.type, 'ready_delay', '23. Preparing -> Ready updates alert type to ready_delay');
    assertEqual(supReady.severity, 'warning', '23. Ready delay 12 min severity is warning');
  }

  // Test 25: Delivered removes urgency
  {
    const oDelivered = createMockOrder({ id: 'od', status: 'delivered', createdAt: minAgo(120) });
    const supDelivered = getOrderSupervisionState(oDelivered, now);
    assertEqual(supDelivered.severity, 'normal', '25. Delivered status removes all operational urgency');
    assertEqual(supDelivered.type, null, '25. Delivered type is null');
  }

  console.log("\nALL PHASE 2 VISUAL SUPERVISION TESTS PASSED SATISFACTORILY!\n");
}

it('bateria de supervision visual fase 2', () => {
  runPhase2Tests();
});
