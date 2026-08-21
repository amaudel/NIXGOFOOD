import { Order, OrderStatus, OrderStatusHistoryItem } from '@/types';
import { OrderAction } from '@/lib/orderTransitions';

export interface RollbackParams {
  orderId: string;
  expectedCurrentStatus: OrderStatus;
  targetStatus: OrderStatus;
  reason: string;
  changedBy?: string;
  changedByName?: string;
  isRollback?: boolean;
}

export interface ExecuteActionParams {
  orderId: string;
  action: OrderAction;
  expectedFromStatus: OrderStatus;
  reason?: string;
  userRole?: string;
}

export interface IOrderRepository {
  getOrders(businessId?: string, branchId?: string): Promise<Order[]>;
  createOrderTransactional(payload: any): Promise<any>;
  updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void>;
  executeOrderAction(params: ExecuteActionParams): Promise<void>;
  rollbackOrderStatus(params: RollbackParams): Promise<void>;
  updatePaymentVerificationStatus(orderId: string, status: 'verified' | 'rejected'): Promise<void>;
  getOrderByTrackingToken(trackingToken: string): Promise<Order | null>;
  getOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryItem[]>;
  getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, OrderStatusHistoryItem[]>>;
}
