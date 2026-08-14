import { Order, OrderStatus } from '@/types';
import { IOrderRepository } from '../interfaces/IOrderRepository';
import { DemoStorage, DEMO_KEYS } from './DemoStorage';
import { demoInitialOrders } from '@/data/demoSeed';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

export class DemoOrderRepository implements IOrderRepository {
  static async getOrders(): Promise<Order[]> {
    return DemoStorage.getItem<Order[]>(DEMO_KEYS.ORDERS, demoInitialOrders);
  }

  static async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    const orders = await DemoOrderRepository.getOrders();
    return orders.find((o) => o.trackingToken === trackingToken) || null;
  }

  static async createOrderTransactional(payload: any): Promise<any> {
    const orders = await DemoOrderRepository.getOrders();

    // Determine next sequential order number (e.g. #1052)
    let maxNum = 1050;
    orders.forEach((o) => {
      const num = parseInt(o.orderNumber.replace('#', ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    const nextOrderNumber = `#${maxNum + 1}`;
    const trackingToken = `trk_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderId = `ord_demo_${Date.now()}`;

    // Map items
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
      trackingToken: trackingToken,
      businessId: payload.businessId || 'b0000000-0000-0000-0000-000000000001',
      branchId: payload.branchId || 'b0000000-0000-0000-0000-000000000002',
      customer: payload.customer || { name: 'Cliente Demo', phone: '0991234567' },
      deliveryMethod: payload.deliveryMethod || 'delivery',
      deliveryLocation: payload.deliveryLocation || undefined,
      items: items,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      status: 'new',
      createdAt: new Date().toISOString(),
      estimatedTime: payload.deliveryMethod === 'delivery' ? '20-30 min' : '15-20 min',
      notes: payload.notes || '',
    };

    orders.unshift(newOrder);
    DemoStorage.setItem(DEMO_KEYS.ORDERS, orders);

    // Broadcast new order event so Admin Tab updates instantly without F5
    DemoBroadcastService.notify('NEW_ORDER_CREATED', newOrder);

    return {
      id: orderId,
      orderNumber: nextOrderNumber,
      trackingToken: trackingToken,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      status: 'new',
      estimatedTime: newOrder.estimatedTime,
      createdAt: newOrder.createdAt,
    };
  }

  static async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const orders = await DemoOrderRepository.getOrders();
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
    DemoStorage.setItem(DEMO_KEYS.ORDERS, updated);

    // Broadcast status change so Client Tracking Tab A updates instantly without F5!
    DemoBroadcastService.notify('ORDER_STATUS_CHANGED', { orderId, newStatus });
  }

  // Instance methods for IOrderRepository interface
  async getOrders(): Promise<Order[]> {
    return DemoOrderRepository.getOrders();
  }

  async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    return DemoOrderRepository.getOrderByTrackingToken(trackingToken);
  }

  async createOrderTransactional(payload: any): Promise<any> {
    return DemoOrderRepository.createOrderTransactional(payload);
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    return DemoOrderRepository.updateOrderStatus(orderId, newStatus);
  }
}
