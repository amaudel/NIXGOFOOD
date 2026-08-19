import { Order, OrderStatus } from '@/types';
import { IOrderRepository, ExecuteActionParams, RollbackParams } from '../interfaces/IOrderRepository';
import { DemoStorage, DEMO_KEYS } from './DemoStorage';
import { demoInitialOrders } from '@/data/demoSeed';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import {
  ORDER_TRANSITION_RULES,
  isValidForwardTransition,
} from '@/lib/orderTransitions';

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

    let maxNum = 1050;
    orders.forEach((o) => {
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
      trackingToken: trackingToken,
      businessId: payload.businessId || 'b0000000-0000-0000-0000-000000000001',
      branchId: payload.branchId || 'b0000000-0000-0000-0000-000000000002',
      customer: payload.customer || { name: 'Cliente Demo', phone: '0991234567' },
      deliveryMethod: payload.deliveryMethod || 'delivery',
      deliveryLocation: payload.deliveryLocation || undefined,
      paymentMethod: payload.paymentMethod || 'cash',
      cashChange: payload.cashChange || undefined,
      transferDetails:
        payload.paymentMethod === 'transfer' && payload.transferDetails
          ? {
              verificationStatus: 'pending',
              ...payload.transferDetails,
            }
          : undefined,
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

  static async executeOrderAction(params: ExecuteActionParams): Promise<void> {
    const rule = ORDER_TRANSITION_RULES[params.action];
    if (!rule) {
      throw new Error(`Acción de pedido inválida: ${params.action}`);
    }

    const orders = await DemoOrderRepository.getOrders();
    const currentOrder = orders.find((o) => o.id === params.orderId);

    if (!currentOrder) {
      throw new Error(`No se encontró el pedido ${params.orderId} en Demo.`);
    }

    // Atomic Compare-and-Swap (CAS) validation
    if (currentOrder.status !== params.expectedFromStatus) {
      throw new Error(
        `CONCURRENCY_ERROR: El pedido cambió de estado desde otro dispositivo. (Esperado: ${params.expectedFromStatus}, Actual: ${currentOrder.status})`
      );
    }

    // Specific Action & State Matrix Validations
    if (params.action === 'DISPATCH_DELIVERY' && currentOrder.deliveryMethod !== 'delivery') {
      throw new Error('INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con entrega a domicilio (Delivery).');
    }

    if (params.action === 'DISPATCH_PICKUP' && currentOrder.deliveryMethod !== 'pickup') {
      throw new Error('INVALID_DELIVERY_METHOD: Esta acción solo aplica a pedidos con retiro en local (Pickup).');
    }

    if (params.action === 'DISPATCH_CONFIRM_DELIVERY' && currentOrder.deliveryMethod !== 'delivery') {
      throw new Error('INVALID_DELIVERY_METHOD: Confirmación de entrega aplica únicamente a pedidos con Delivery.');
    }

    // Payment validation for dispatch actions
    if (['DISPATCH_DELIVERY', 'DISPATCH_PICKUP'].includes(params.action)) {
      const isCash = currentOrder.paymentMethod === 'cash';
      const isVerified = currentOrder.transferDetails?.verificationStatus === 'verified';
      if (!isCash && !isVerified) {
        throw new Error('PAYMENT_NOT_VERIFIED: No se puede despachar un pedido con pago por transferencia sin verificar.');
      }
    }

    // Admin Cancel rules
    if (params.action === 'ADMIN_CANCEL') {
      if (!params.reason || params.reason.trim().length < 3) {
        throw new Error('REASON_REQUIRED: Motivo obligatorio para cancelar el pedido.');
      }
      if (['delivered', 'cancelled'].includes(currentOrder.status)) {
        throw new Error('INVALID_TRANSITION: Un pedido entregado o cancelado no se puede cancelar.');
      }
    }

    const targetStatus = rule.targetStatus;
    const updated = orders.map((o) => (o.id === params.orderId ? { ...o, status: targetStatus } : o));
    DemoStorage.setItem(DEMO_KEYS.ORDERS, updated);

    DemoBroadcastService.notify('ORDER_STATUS_CHANGED', { orderId: params.orderId, newStatus: targetStatus });
  }

  static async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void> {
    throw new Error(
      'DIRECT_STATUS_UPDATE_DENIED: Las modificaciones libres de estado están deshabilitadas. Utiliza executeOrderAction con una acción explícita.'
    );
  }

  static async rollbackOrderStatus(params: RollbackParams): Promise<void> {
    const orders = await DemoOrderRepository.getOrders();
    const currentOrder = orders.find((o) => o.id === params.orderId);

    if (!currentOrder) {
      throw new Error('No se encontró el pedido para revertir en Demo.');
    }

    if (currentOrder.status !== params.expectedCurrentStatus) {
      throw new Error(
        `CONCURRENCY_ERROR: El pedido cambió de estado desde otro dispositivo. Estado actual: ${currentOrder.status}`
      );
    }

    const updated = orders.map((o) => (o.id === params.orderId ? { ...o, status: params.targetStatus } : o));
    DemoStorage.setItem(DEMO_KEYS.ORDERS, updated);
    DemoBroadcastService.notify('ORDER_STATUS_CHANGED', { orderId: params.orderId, newStatus: params.targetStatus });
  }

  static async getOrderStatusHistory(orderId: string): Promise<any[]> {
    return [];
  }

  static async updatePaymentVerificationStatus(orderId: string, verificationStatus: 'verified' | 'rejected'): Promise<void> {
    const orders = await DemoOrderRepository.getOrders();
    const updated = orders.map((o) => {
      if (o.id === orderId && o.transferDetails) {
        return {
          ...o,
          transferDetails: {
            ...o.transferDetails,
            verificationStatus,
          },
        };
      }
      return o;
    });
    DemoStorage.setItem(DEMO_KEYS.ORDERS, updated);
    DemoBroadcastService.notify('ORDER_STATUS_CHANGED', { orderId, verificationStatus });
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

  async executeOrderAction(params: ExecuteActionParams): Promise<void> {
    return DemoOrderRepository.executeOrderAction(params);
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void> {
    return DemoOrderRepository.updateOrderStatus(orderId, newStatus, reason);
  }

  async rollbackOrderStatus(params: RollbackParams): Promise<void> {
    return DemoOrderRepository.rollbackOrderStatus(params);
  }

  async getOrderStatusHistory(orderId: string): Promise<any[]> {
    return DemoOrderRepository.getOrderStatusHistory(orderId);
  }

  static async getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, any[]>> {
    return {};
  }

  async getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, any[]>> {
    return DemoOrderRepository.getOrderStatusHistoryMap(orderIds);
  }

  async updatePaymentVerificationStatus(orderId: string, verificationStatus: 'verified' | 'rejected'): Promise<void> {
    return DemoOrderRepository.updatePaymentVerificationStatus(orderId, verificationStatus);
  }
}
