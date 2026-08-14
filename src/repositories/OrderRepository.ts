import { Order, OrderStatus } from '@/types';
import { getOrderRepository } from './factory';

export class OrderRepository {
  static async getOrders(businessId?: string): Promise<Order[]> {
    return getOrderRepository().getOrders(businessId);
  }

  static async createOrderTransactional(payload: any): Promise<any> {
    return getOrderRepository().createOrderTransactional(payload);
  }

  static async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    return getOrderRepository().updateOrderStatus(orderId, newStatus);
  }
}
