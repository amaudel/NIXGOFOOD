import { Order, OrderStatus } from '@/types';

export interface IOrderRepository {
  getOrders(businessId?: string): Promise<Order[]>;
  createOrderTransactional(payload: any): Promise<any>;
  updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void>;
  getOrderByTrackingToken?(trackingToken: string): Promise<Order | null>;
}
