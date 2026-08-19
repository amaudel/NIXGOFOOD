import { OrderStatus } from '@/types';

export type OrderAction =
  | 'KITCHEN_START'             // new -> preparing (Cocina)
  | 'KITCHEN_READY'             // preparing -> ready (Cocina)
  | 'DISPATCH_DELIVERY'         // ready -> on_the_way (Despacho - Delivery)
  | 'DISPATCH_PICKUP'           // ready -> delivered (Despacho - Pickup)
  | 'DISPATCH_CONFIRM_DELIVERY' // on_the_way -> delivered (Despacho - Delivery Confirm)
  | 'ADMIN_CANCEL';             // * -> cancelled (Caja/Admin)

export interface TransitionRule {
  action: OrderAction;
  allowedFrom: OrderStatus | OrderStatus[];
  targetStatus: OrderStatus;
  allowedRoles: ('owner' | 'admin' | 'operator')[];
  station: 'kitchen' | 'dispatch' | 'orders';
  label: string;
}

export const ORDER_TRANSITION_RULES: Record<OrderAction, TransitionRule> = {
  KITCHEN_START: {
    action: 'KITCHEN_START',
    allowedFrom: 'new',
    targetStatus: 'preparing',
    allowedRoles: ['owner', 'admin', 'operator'],
    station: 'kitchen',
    label: 'Empezar preparación',
  },
  KITCHEN_READY: {
    action: 'KITCHEN_READY',
    allowedFrom: 'preparing',
    targetStatus: 'ready',
    allowedRoles: ['owner', 'admin', 'operator'],
    station: 'kitchen',
    label: 'Marcar listo',
  },
  DISPATCH_DELIVERY: {
    action: 'DISPATCH_DELIVERY',
    allowedFrom: 'ready',
    targetStatus: 'on_the_way',
    allowedRoles: ['owner', 'admin', 'operator'],
    station: 'dispatch',
    label: 'Entregar a repartidor',
  },
  DISPATCH_PICKUP: {
    action: 'DISPATCH_PICKUP',
    allowedFrom: 'ready',
    targetStatus: 'delivered',
    allowedRoles: ['owner', 'admin', 'operator'],
    station: 'dispatch',
    label: 'Entregar al cliente (Pickup)',
  },
  DISPATCH_CONFIRM_DELIVERY: {
    action: 'DISPATCH_CONFIRM_DELIVERY',
    allowedFrom: 'on_the_way',
    targetStatus: 'delivered',
    allowedRoles: ['owner', 'admin', 'operator'],
    station: 'dispatch',
    label: 'Confirmar entrega (Delivery)',
  },
  ADMIN_CANCEL: {
    action: 'ADMIN_CANCEL',
    allowedFrom: ['new', 'preparing', 'ready', 'on_the_way'],
    targetStatus: 'cancelled',
    allowedRoles: ['owner', 'admin'],
    station: 'orders',
    label: 'Cancelar pedido',
  },
};

/**
 * Validates whether a state transition from `fromStatus` to `toStatus` is a valid forward operation.
 */
export function isValidForwardTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  if (toStatus === 'cancelled') {
    return fromStatus !== 'delivered' && fromStatus !== 'cancelled';
  }

  const validPairs: [OrderStatus, OrderStatus][] = [
    ['new', 'preparing'],
    ['preparing', 'ready'],
    ['ready', 'on_the_way'],
    ['ready', 'delivered'],
    ['on_the_way', 'delivered'],
  ];

  return validPairs.some(([f, t]) => f === fromStatus && t === toStatus);
}

/**
 * Derives the target status from an explicit OrderAction.
 */
export function getTargetStatusForAction(action: OrderAction): OrderStatus {
  const rule = ORDER_TRANSITION_RULES[action];
  if (!rule) {
    throw new Error(`Acción de pedido desconocida: ${action}`);
  }
  return rule.targetStatus;
}
