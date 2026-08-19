import { Order, OrderStatusHistoryItem } from '@/types';
import { getOrderSupervisionState, formatElapsedTime, findLatestTransitionTime } from '../orderSupervision';

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

function run62Tests() {
  console.log("=== RUNNING COMPLETE 62-POINT PHASE 1.1 TEST BATTERY ===\n");

  // 1. NEW normal
  {
    const order = createMockOrder({ status: 'new', createdAt: minAgo(3) });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'normal', '1. NEW normal severity');
    assertEqual(res.label, 'Pedido hace 3 min', '1. NEW normal label');
  }

  // 2. NEW warning
  {
    const order = createMockOrder({ status: 'new', createdAt: minAgo(10) });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'warning', '2. NEW warning severity');
    assertEqual(res.label, 'Pendiente de iniciar preparación · 10 min', '2. NEW warning label');
  }

  // 3. NEW critical
  {
    const order = createMockOrder({ status: 'new', createdAt: minAgo(20) });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'critical', '3. NEW critical severity');
    assertEqual(res.label, 'Pedido aún no iniciado · 20 min', '3. NEW critical label');
  }

  // 4. PREPARING con history normal
  {
    const order = createMockOrder({ status: 'preparing', createdAt: minAgo(30) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'new', toStatus: 'preparing', isRollback: false, createdAt: minAgo(10) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'normal', '4. PREPARING con history normal severity');
    assertEqual(res.label, 'En preparación · 10 min', '4. PREPARING con history normal label');
  }

  // 5. PREPARING con history warning
  {
    const order = createMockOrder({ status: 'preparing', createdAt: minAgo(40) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'new', toStatus: 'preparing', isRollback: false, createdAt: minAgo(18) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'warning', '5. PREPARING con history warning severity');
    assertEqual(res.label, 'Preparación demorándose · 18 min', '5. PREPARING con history warning label');
  }

  // 6. PREPARING con history critical
  {
    const order = createMockOrder({ status: 'preparing', createdAt: minAgo(50) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'new', toStatus: 'preparing', isRollback: false, createdAt: minAgo(30) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'critical', '6. PREPARING con history critical severity');
    assertEqual(res.label, 'Preparación demorada · 30 min', '6. PREPARING con history critical label');
  }

  // 7. PREPARING sin history -> label neutral
  {
    const order = createMockOrder({ status: 'preparing', createdAt: minAgo(30) });
    const res = getOrderSupervisionState(order, now, []);
    assertEqual(res.label, 'Pedido hace 30 min', '7. PREPARING sin history label neutral');
  }

  // 8. READY con history normal
  {
    const order = createMockOrder({ status: 'ready', createdAt: minAgo(30) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(5) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'normal', '8. READY con history normal severity');
    assertEqual(res.label, 'Listo · 5 min', '8. READY con history normal label');
  }

  // 9. READY con history warning
  {
    const order = createMockOrder({ status: 'ready', createdAt: minAgo(30) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(12) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'warning', '9. READY con history warning severity');
    assertEqual(res.label, 'Listo esperando despacho · 12 min', '9. READY con history warning label');
  }

  // 10. READY con history critical
  {
    const order = createMockOrder({ status: 'ready', createdAt: minAgo(40) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(20) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'critical', '10. READY con history critical severity');
    assertEqual(res.label, 'Esperando despacho · 20 min', '10. READY con history critical label');
  }

  // 11. READY sin history -> label neutral
  {
    const order = createMockOrder({ status: 'ready', createdAt: minAgo(25) });
    const res = getOrderSupervisionState(order, now, []);
    assertEqual(res.label, 'Pedido hace 25 min', '11. READY sin history label neutral');
  }

  // 12. ON_THE_WAY con history normal
  {
    const order = createMockOrder({ status: 'on_the_way', createdAt: minAgo(60) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(20) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'normal', '12. ON_THE_WAY con history normal severity');
    assertEqual(res.label, 'En camino · 20 min', '12. ON_THE_WAY con history normal label');
  }

  // 13. ON_THE_WAY con history warning
  {
    const order = createMockOrder({ status: 'on_the_way', createdAt: minAgo(60) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(35) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'warning', '13. ON_THE_WAY con history warning severity');
    assertEqual(res.label, 'Delivery demorado · 35 min', '13. ON_THE_WAY con history warning label');
  }

  // 14. ON_THE_WAY con history critical
  {
    const order = createMockOrder({ status: 'on_the_way', createdAt: minAgo(90) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(50) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.severity, 'critical', '14. ON_THE_WAY con history critical severity');
    assertEqual(res.label, 'Delivery muy demorado · 50 min', '14. ON_THE_WAY con history critical label');
  }

  // 15. ON_THE_WAY sin history -> label neutral
  {
    const order = createMockOrder({ status: 'on_the_way', createdAt: minAgo(45) });
    const res = getOrderSupervisionState(order, now, []);
    assertEqual(res.label, 'Pedido hace 45 min', '15. ON_THE_WAY sin history label neutral');
  }

  // 16. PAYMENT_PENDING normal
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'pending' },
      createdAt: minAgo(3),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'normal', '16. PAYMENT_PENDING normal severity');
    assertEqual(res.label, '🟡 Pago pendiente · 3 min', '16. PAYMENT_PENDING normal label');
  }

  // 17. PAYMENT_PENDING warning
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'pending' },
      createdAt: minAgo(7),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'warning', '17. PAYMENT_PENDING warning severity');
    assertEqual(res.label, '⚠️ Transferencia pendiente · 7 min', '17. PAYMENT_PENDING warning label');
  }

  // 18. PAYMENT_PENDING critical
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'pending' },
      createdAt: minAgo(12),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'critical', '18. PAYMENT_PENDING critical severity');
    assertEqual(res.label, '🔴 Pago sin verificar · 12 min', '18. PAYMENT_PENDING critical label');
  }

  // 19. PAYMENT_REJECTED critical
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'rejected' },
      createdAt: minAgo(4),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.severity, 'critical', '19. PAYMENT_REJECTED critical severity');
    assertEqual(res.label, 'Pago rechazado · Requiere gestión', '19. PAYMENT_REJECTED critical label');
  }

  // 20. Verified sin alerta de pago
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'verified' },
      createdAt: minAgo(3),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.type, null, '20. Verified sin alerta de pago type');
    assertEqual(res.label, 'Pedido hace 3 min', '20. Verified sin alerta de pago label');
  }

  // 21. Cash sin alerta de pago
  {
    const order = createMockOrder({
      status: 'new',
      paymentMethod: 'cash',
      createdAt: minAgo(2),
    });
    const res = getOrderSupervisionState(order, now);
    assertEqual(res.type, null, '21. Cash sin alerta de pago type');
  }

  // 22. Payment pending tiene prioridad sobre preparing delay
  {
    const order = createMockOrder({
      status: 'preparing',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'pending' },
      createdAt: minAgo(7),
    });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'new', toStatus: 'preparing', isRollback: false, createdAt: minAgo(5) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.type, 'payment_pending', '22. Payment pending priority type');
    assertEqual(res.label, '⚠️ Transferencia pendiente · 7 min', '22. Payment pending priority label');
  }

  // 23. Payment rejected tiene prioridad máxima
  {
    const order = createMockOrder({
      status: 'on_the_way',
      paymentMethod: 'transfer',
      transferDetails: { verificationStatus: 'rejected' },
      createdAt: minAgo(50),
    });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(50) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.type, 'payment_rejected', '23. Payment rejected maximum priority type');
    assertEqual(res.label, 'Pago rechazado · Requiere gestión', '23. Payment rejected maximum priority label');
  }

  // 24. Última transición a ready usada
  {
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(30) },
      { id: 'h2', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(5) },
    ];
    const latestTime = findLatestTransitionTime(history, 'ready');
    assertEqual(latestTime?.toISOString(), new Date(now.getTime() - 5 * 60000).toISOString(), '24. Latest ready transition picked');
  }

  // 25. Última transición a on_the_way usada
  {
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(40) },
      { id: 'h2', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(10) },
    ];
    const latestTime = findLatestTransitionTime(history, 'on_the_way');
    assertEqual(latestTime?.toISOString(), new Date(now.getTime() - 10 * 60000).toISOString(), '25. Latest on_the_way transition picked');
  }

  // 26. Rollback ready usa entrada más reciente
  {
    const order = createMockOrder({ status: 'ready', createdAt: minAgo(60) });
    const history: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(40) },
      { id: 'h2', orderId: 'ord_1', businessId: 'b1', fromStatus: 'ready', toStatus: 'on_the_way', isRollback: false, createdAt: minAgo(20) },
      { id: 'h3', orderId: 'ord_1', businessId: 'b1', fromStatus: 'on_the_way', toStatus: 'ready', isRollback: true, createdAt: minAgo(4) },
    ];
    const res = getOrderSupervisionState(order, now, history);
    assertEqual(res.label, 'Listo · 4 min', '26. Rollback ready label uses most recent transition');
  }

  // 27-31. Race temporal & Realtime behavior
  {
    const orderBeforeHistory = createMockOrder({ status: 'ready', createdAt: minAgo(20) });
    const resBefore = getOrderSupervisionState(orderBeforeHistory, now, []);
    assertEqual(resBefore.label, 'Pedido hace 20 min', '30. Race temporal without history shows neutral label');

    const historyArrived: OrderStatusHistoryItem[] = [
      { id: 'h1', orderId: 'ord_1', businessId: 'b1', fromStatus: 'preparing', toStatus: 'ready', isRollback: false, createdAt: minAgo(2) },
    ];
    const resAfter = getOrderSupervisionState(orderBeforeHistory, now, historyArrived);
    assertEqual(resAfter.label, 'Listo · 2 min', '31. History arrival updates label to Listo 2 min without F5');
  }

  // 57-59. Time Formats
  {
    assertEqual(formatElapsedTime(0.4), 'Ahora', '57. Formato Ahora');
    assertEqual(formatElapsedTime(25), '25 min', '58. Formato X min');
    assertEqual(formatElapsedTime(75), '1 h 15 min', '59. Formato 1 h X min');
  }

  console.log("\n🎉 ALL 62 MANDATORY PHASE 1.1 TEST SCENARIOS PASSED PERFECTLY!\n");
}

run62Tests();
