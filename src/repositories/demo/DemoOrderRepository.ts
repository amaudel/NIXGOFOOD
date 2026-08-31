import { Order, OrderStatus } from '@/types';
import { IOrderRepository, ExecuteActionParams, RollbackParams } from '../interfaces/IOrderRepository';

// En el navegador esta clase habla con /api/demo/orders (que a su vez lee y
// escribe en Vercel KV) en vez de localStorage -- ver el comentario en
// src/lib/demo/demoOrderStore.ts. Server-side (rutas API que corren en el
// servidor, ej. /api/orders/lookup) llama directo a las funciones de
// demoOrderStore, sin dar un salto HTTP innecesario.
const isServer = typeof window === 'undefined';

async function callApi(body: object): Promise<any> {
  const res = await fetch('/api/demo/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error en la operación de pedido demo.');
  }
  return data;
}

export class DemoOrderRepository implements IOrderRepository {
  static async getOrders(businessId?: string): Promise<Order[]> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return businessId ? store.getOrdersForBusiness(businessId) : store.getAllOrders();
    }
    const url = businessId
      ? `/api/demo/orders?businessId=${encodeURIComponent(businessId)}`
      : '/api/demo/orders?all=1';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.orders || [];
  }

  static async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.getOrderByTrackingToken(trackingToken);
    }
    const res = await fetch(`/api/demo/orders?trackingToken=${encodeURIComponent(trackingToken)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.order || null;
  }

  static async createOrderTransactional(payload: any): Promise<any> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.createDemoOrder(payload);
    }
    const data = await callApi({ type: 'CREATE', payload });
    return data.result;
  }

  static async executeOrderAction(params: ExecuteActionParams): Promise<void> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.executeDemoOrderAction(params);
    }
    await callApi({ type: 'EXECUTE_ACTION', params });
  }

  static async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void> {
    throw new Error(
      'DIRECT_STATUS_UPDATE_DENIED: Las modificaciones libres de estado están deshabilitadas. Utiliza executeOrderAction con una acción explícita.'
    );
  }

  static async rollbackOrderStatus(params: RollbackParams): Promise<void> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.rollbackDemoOrderStatus(params);
    }
    await callApi({ type: 'ROLLBACK', params });
  }

  static async getOrderStatusHistory(orderId: string): Promise<any[]> {
    return [];
  }

  static async updatePaymentVerificationStatus(orderId: string, verificationStatus: 'verified' | 'rejected'): Promise<void> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.updateDemoPaymentVerification(orderId, verificationStatus);
    }
    await callApi({ type: 'VERIFY_PAYMENT', orderId, verificationStatus });
  }

  static async resetForBusiness(businessId: string): Promise<void> {
    if (isServer) {
      const store = await import('@/lib/demo/demoOrderStore');
      return store.resetDemoOrdersForBusiness(businessId);
    }
    await callApi({ type: 'RESET', businessId });
  }

  // Instance methods for IOrderRepository interface
  async getOrders(businessId?: string, branchId?: string): Promise<Order[]> {
    const orders = await DemoOrderRepository.getOrders(businessId);
    return branchId ? orders.filter((o) => o.branchId === branchId) : orders;
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

  async getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, any[]>> {
    return {};
  }

  async updatePaymentVerificationStatus(orderId: string, verificationStatus: 'verified' | 'rejected'): Promise<void> {
    return DemoOrderRepository.updatePaymentVerificationStatus(orderId, verificationStatus);
  }
}
