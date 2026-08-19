import { Order, OrderStatus } from '@/types';

export type OrderFilterId = 'todos' | 'nuevos' | 'en_curso' | 'entregados' | 'cancelados';

export interface OrderFilterConfig {
  id: OrderFilterId;
  label: string;
  statuses?: OrderStatus[];
  ariaLabel: (count: number) => string;
  badgeStyle: {
    bg: string;
    text: string;
    border?: string;
    pulse?: boolean;
  };
}

/**
 * Single Source of Truth for Cashier Order Filters and Counts
 */
export const ORDER_FILTERS: OrderFilterConfig[] = [
  {
    id: 'todos',
    label: 'Todos',
    ariaLabel: (count) => `Todos, ${count} ${count === 1 ? 'pedido' : 'pedidos'} en total`,
    badgeStyle: {
      bg: 'bg-zinc-800',
      text: 'text-zinc-300',
      border: 'border border-zinc-700',
    },
  },
  {
    id: 'nuevos',
    label: 'Nuevos',
    statuses: ['new'],
    ariaLabel: (count) => `Nuevos, ${count} ${count === 1 ? 'pedido nuevo' : 'pedidos nuevos'}`,
    badgeStyle: {
      bg: 'bg-rose-600',
      text: 'text-white',
    },
  },
  {
    id: 'en_curso',
    label: 'En curso',
    statuses: ['preparing', 'ready', 'on_the_way'],
    ariaLabel: (count) => `En curso, ${count} ${count === 1 ? 'pedido activo' : 'pedidos activos'}`,
    badgeStyle: {
      bg: 'bg-rose-600',
      text: 'text-white font-black',
    },
  },
  {
    id: 'entregados',
    label: 'Entregados',
    statuses: ['delivered'],
    ariaLabel: (count) => `Entregados, ${count} ${count === 1 ? 'pedido entregado' : 'pedidos entregados'}`,
    badgeStyle: {
      bg: 'bg-emerald-950',
      text: 'text-emerald-300',
      border: 'border border-emerald-800/80',
    },
  },
  {
    id: 'cancelados',
    label: 'Cancelados',
    statuses: ['cancelled'],
    ariaLabel: (count) => `Cancelados, ${count} ${count === 1 ? 'pedido cancelado' : 'pedidos cancelados'}`,
    badgeStyle: {
      bg: 'bg-rose-950/80',
      text: 'text-rose-300',
      border: 'border border-rose-800/80',
    },
  },
];

/**
 * Filter orders by filter ID using the single source of truth configuration
 */
export function filterOrdersByTab(orders: Order[], filterId: OrderFilterId): Order[] {
  const filterDef = ORDER_FILTERS.find((f) => f.id === filterId);
  if (!filterDef || !filterDef.statuses) {
    return orders;
  }
  return orders.filter((o) => filterDef.statuses!.includes(o.status));
}

/**
 * Calculate order count for a specific filter ID using the single source of truth configuration
 */
export function getOrderFilterCount(orders: Order[], filterId: OrderFilterId): number {
  return filterOrdersByTab(orders, filterId).length;
}

/**
 * Format badge text for counts: 1..9, 10..99, 100+
 */
export function formatBadgeCount(count: number): string {
  if (count >= 100) return '99+';
  return count.toString();
}
