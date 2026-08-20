import { Order, OrderStatus, OrderStatusHistoryItem } from '@/types';
import { getOrderRepository } from './factory';
import { RollbackParams, ExecuteActionParams } from './interfaces/IOrderRepository';

export class OrderRepository {
  static async getOrders(businessId?: string, branchId?: string): Promise<Order[]> {
    return getOrderRepository().getOrders(businessId, branchId);
  }

  static async createOrderTransactional(payload: any): Promise<any> {
    return getOrderRepository().createOrderTransactional(payload);
  }

  static async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void> {
    return getOrderRepository().updateOrderStatus(orderId, newStatus, reason);
  }

  static async executeOrderAction(params: ExecuteActionParams): Promise<void> {
    return getOrderRepository().executeOrderAction(params);
  }

  static async rollbackOrderStatus(params: RollbackParams): Promise<void> {
    return getOrderRepository().rollbackOrderStatus(params);
  }

  static async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryItem[]> {
    return getOrderRepository().getOrderStatusHistory(orderId);
  }

  static async getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, OrderStatusHistoryItem[]>> {
    return getOrderRepository().getOrderStatusHistoryMap(orderIds);
  }

  static async updatePaymentVerificationStatus(orderId: string, status: 'verified' | 'rejected'): Promise<void> {
    return getOrderRepository().updatePaymentVerificationStatus(orderId, status);
  }
}
