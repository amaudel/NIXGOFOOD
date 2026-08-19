export interface RecentOrder {
  orderNumber: string;
  trackingToken: string;
  createdAt: string;
}

const RECENT_ORDERS_KEY = 'nixgofood_recent_orders';
const LAST_TRACKING_KEY = 'nixgofood_last_tracking';
const LAST_ORDER_NUM_KEY = 'nixgofood_last_order_number';

export function saveRecentOrder(orderNumber: string, trackingToken: string): void {
  if (typeof window === 'undefined') return;

  try {
    const formattedNum = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
    const newEntry: RecentOrder = {
      orderNumber: formattedNum,
      trackingToken,
      createdAt: new Date().toISOString(),
    };

    // Save legacy individual keys
    localStorage.setItem(LAST_TRACKING_KEY, trackingToken);
    localStorage.setItem(LAST_ORDER_NUM_KEY, formattedNum);

    // Save up to 3 recent orders
    const existing = getRecentOrders();
    const filtered = existing.filter((o) => o.trackingToken !== trackingToken);
    const updated = [newEntry, ...filtered].slice(0, 3);

    localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error saving recent order to localStorage:', err);
  }
}

export function getRecentOrders(): RecentOrder[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(RECENT_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }

    // Fallback to legacy single keys if list key does not exist yet
    const lastTracking = localStorage.getItem(LAST_TRACKING_KEY);
    const lastNum = localStorage.getItem(LAST_ORDER_NUM_KEY);

    if (lastTracking && lastNum) {
      return [
        {
          orderNumber: lastNum,
          trackingToken: lastTracking,
          createdAt: new Date().toISOString(),
        },
      ];
    }
  } catch (err) {
    console.error('Error reading recent orders from localStorage:', err);
  }

  return [];
}

export function getLastOrder(): RecentOrder | null {
  const orders = getRecentOrders();
  return orders.length > 0 ? orders[0] : null;
}

export function removeRecentOrder(trackingToken: string): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = getRecentOrders();
    const updated = existing.filter((o) => o.trackingToken !== trackingToken);
    localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(updated));

    if (localStorage.getItem(LAST_TRACKING_KEY) === trackingToken) {
      if (updated.length > 0) {
        localStorage.setItem(LAST_TRACKING_KEY, updated[0].trackingToken);
        localStorage.setItem(LAST_ORDER_NUM_KEY, updated[0].orderNumber);
      } else {
        localStorage.removeItem(LAST_TRACKING_KEY);
        localStorage.removeItem(LAST_ORDER_NUM_KEY);
      }
    }
  } catch (err) {
    console.error('Error removing recent order from localStorage:', err);
  }
}
