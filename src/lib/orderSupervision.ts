import { Order, OrderStatusHistoryItem } from '@/types';
import { SUPERVISION_TIMING_CONFIG } from '@/config/orderSupervisionTiming';

export type SupervisionSeverity = 'normal' | 'warning' | 'critical';

export type SupervisionAlertType =
  | 'payment_rejected'
  | 'payment_pending'
  | 'ready_delay'
  | 'delivery_delay'
  | 'preparing_delay'
  | 'new_delay'
  | null;

export interface OrderSupervisionState {
  severity: SupervisionSeverity;
  type: SupervisionAlertType;
  label: string;
  elapsedMinutes: number;
  elapsedLabel: string;
}

/**
 * Format elapsed time into human-readable strings according to Rule 7 & 57-59:
 * - < 1 min: "Ahora"
 * - 1–59 min: "X min"
 * - >= 60 min: "1 h 12 min" (or "1 h" if 0 mins)
 */
export function formatElapsedTime(minutes: number): string {
  const totalMins = Math.max(0, Math.floor(minutes));
  if (totalMins < 1) {
    return 'Ahora';
  }
  if (totalMins < 60) {
    return `${totalMins} min`;
  }
  const hours = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;
  if (remainingMins === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${remainingMins} min`;
}

/**
 * Find the timestamp of the LATEST transition to a given target status in history.
 * Handles multiple entries and rollbacks correctly by picking the highest (most recent) timestamp.
 */
export function findLatestTransitionTime(
  history: OrderStatusHistoryItem[] | undefined,
  targetStatus: string
): Date | null {
  if (!history || history.length === 0) return null;
  const matches = history.filter(
    (h) => h.toStatus === targetStatus || (h as any).to_status === targetStatus
  );
  if (matches.length === 0) return null;

  // Sort descending by createdAt to guarantee picking the latest transition
  matches.sort(
    (a, b) =>
      new Date(b.createdAt || (b as any).created_at).getTime() -
      new Date(a.createdAt || (a as any).created_at).getTime()
  );

  return new Date(matches[0].createdAt || (matches[0] as any).created_at);
}

/**
 * Central Helper: Calculate Order Supervision State according to Phase 1.1 Rules.
 */
export function getOrderSupervisionState(
  order: Order,
  now: Date,
  history?: OrderStatusHistoryItem[]
): OrderSupervisionState {
  const createdAtTime = new Date(order.createdAt);
  const createdElapsedMins = Math.max(0, (now.getTime() - createdAtTime.getTime()) / 60000);
  const createdElapsedText = formatElapsedTime(createdElapsedMins);

  // 1. Evaluate Payment Status Alerts (Priority 1 & 2)
  let paymentAlert: {
    severity: SupervisionSeverity;
    type: SupervisionAlertType;
    label: string;
    elapsedMinutes: number;
    elapsedLabel: string;
  } | null = null;

  if (order.paymentMethod === 'transfer' && order.transferDetails) {
    const status = order.transferDetails.verificationStatus;
    if (status === 'rejected') {
      paymentAlert = {
        severity: 'critical',
        type: 'payment_rejected',
        label: 'Pago rechazado · Requiere gestión',
        elapsedMinutes: createdElapsedMins,
        elapsedLabel: createdElapsedText,
      };
    } else if (status === 'pending') {
      const cfg = SUPERVISION_TIMING_CONFIG.PAYMENT_PENDING;
      if (createdElapsedMins >= cfg.criticalMinutes) {
        paymentAlert = {
          severity: 'critical',
          type: 'payment_pending',
          label: `🔴 Pago sin verificar · ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else if (createdElapsedMins >= cfg.warningMinutes) {
        paymentAlert = {
          severity: 'warning',
          type: 'payment_pending',
          label: `⚠️ Transferencia pendiente · ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else {
        paymentAlert = {
          severity: 'normal',
          type: 'payment_pending',
          label: `🟡 Pago pendiente · ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      }
    }
  }

  // 2. Evaluate Order Status Delay Alerts (Priority 3 to 6)
  let statusAlert: {
    severity: SupervisionSeverity;
    type: SupervisionAlertType;
    label: string;
    elapsedMinutes: number;
    elapsedLabel: string;
  } = {
    severity: 'normal',
    type: null,
    label: `Pedido hace ${createdElapsedText}`,
    elapsedMinutes: createdElapsedMins,
    elapsedLabel: createdElapsedText,
  };

  switch (order.status) {
    case 'new': {
      const cfg = SUPERVISION_TIMING_CONFIG.NEW;
      if (createdElapsedMins >= cfg.criticalMinutes) {
        statusAlert = {
          severity: 'critical',
          type: 'new_delay',
          label: `Pedido aún no iniciado · ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else if (createdElapsedMins >= cfg.warningMinutes) {
        statusAlert = {
          severity: 'warning',
          type: 'new_delay',
          label: `Pendiente de iniciar preparación · ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else {
        statusAlert = {
          severity: 'normal',
          type: null,
          label: `Pedido hace ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      }
      break;
    }

    case 'preparing': {
      const prepTransTime = findLatestTransitionTime(history, 'preparing');
      const isFallback = !prepTransTime;

      if (isFallback) {
        // Fallback neutral label: Do NOT claim "En preparación · X min" when transition timestamp is unknown
        statusAlert = {
          severity: 'normal',
          type: null,
          label: `Pedido hace ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else {
        const elapsedMins = Math.max(0, (now.getTime() - prepTransTime.getTime()) / 60000);
        const elapsedText = formatElapsedTime(elapsedMins);
        const cfg = SUPERVISION_TIMING_CONFIG.PREPARING;

        if (elapsedMins >= cfg.criticalMinutes) {
          statusAlert = {
            severity: 'critical',
            type: 'preparing_delay',
            label: `Preparación demorada · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else if (elapsedMins >= cfg.warningMinutes) {
          statusAlert = {
            severity: 'warning',
            type: 'preparing_delay',
            label: `Preparación demorándose · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else {
          statusAlert = {
            severity: 'normal',
            type: null,
            label: `En preparación · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        }
      }
      break;
    }

    case 'ready': {
      const readyTransTime = findLatestTransitionTime(history, 'ready');
      const isFallback = !readyTransTime;

      if (isFallback) {
        // Fallback neutral label: Do NOT claim "Listo · X min" when transition timestamp is unknown
        statusAlert = {
          severity: 'normal',
          type: null,
          label: `Pedido hace ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else {
        const elapsedMins = Math.max(0, (now.getTime() - readyTransTime.getTime()) / 60000);
        const elapsedText = formatElapsedTime(elapsedMins);
        const cfg = SUPERVISION_TIMING_CONFIG.READY;

        if (elapsedMins >= cfg.criticalMinutes) {
          statusAlert = {
            severity: 'critical',
            type: 'ready_delay',
            label: `Esperando despacho · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else if (elapsedMins >= cfg.warningMinutes) {
          statusAlert = {
            severity: 'warning',
            type: 'ready_delay',
            label: `Listo esperando despacho · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else {
          statusAlert = {
            severity: 'normal',
            type: null,
            label: `Listo · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        }
      }
      break;
    }

    case 'on_the_way': {
      const wayTransTime = findLatestTransitionTime(history, 'on_the_way');
      const isFallback = !wayTransTime;

      if (isFallback) {
        // Fallback neutral label: Do NOT claim "En camino · X min" when transition timestamp is unknown
        statusAlert = {
          severity: 'normal',
          type: null,
          label: `Pedido hace ${createdElapsedText}`,
          elapsedMinutes: createdElapsedMins,
          elapsedLabel: createdElapsedText,
        };
      } else {
        const elapsedMins = Math.max(0, (now.getTime() - wayTransTime.getTime()) / 60000);
        const elapsedText = formatElapsedTime(elapsedMins);
        const cfg = SUPERVISION_TIMING_CONFIG.ON_THE_WAY;

        if (elapsedMins >= cfg.criticalMinutes) {
          statusAlert = {
            severity: 'critical',
            type: 'delivery_delay',
            label: `Delivery muy demorado · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else if (elapsedMins >= cfg.warningMinutes) {
          statusAlert = {
            severity: 'warning',
            type: 'delivery_delay',
            label: `Delivery demorado · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        } else {
          statusAlert = {
            severity: 'normal',
            type: null,
            label: `En camino · ${elapsedText}`,
            elapsedMinutes: elapsedMins,
            elapsedLabel: elapsedText,
          };
        }
      }
      break;
    }

    case 'delivered':
      statusAlert = {
        severity: 'normal',
        type: null,
        label: 'Entregado',
        elapsedMinutes: createdElapsedMins,
        elapsedLabel: createdElapsedText,
      };
      break;

    case 'cancelled':
      statusAlert = {
        severity: 'normal',
        type: null,
        label: 'Cancelado',
        elapsedMinutes: createdElapsedMins,
        elapsedLabel: createdElapsedText,
      };
      break;
  }

  // 3. Resolve Alert Priority according to Section 5:
  // 1. payment_rejected
  // 2. payment_pending
  // 3. ready_delay
  // 4. delivery_delay
  // 5. preparing_delay
  // 6. new_delay

  if (paymentAlert) {
    if (paymentAlert.type === 'payment_rejected') {
      return paymentAlert;
    }

    if (paymentAlert.type === 'payment_pending') {
      if (paymentAlert.severity !== 'normal') {
        return paymentAlert;
      }
      if (statusAlert.severity === 'normal') {
        return paymentAlert;
      }
      const alertPriorityMap: Record<NonNullable<SupervisionAlertType>, number> = {
        payment_rejected: 1,
        payment_pending: 2,
        ready_delay: 3,
        delivery_delay: 4,
        preparing_delay: 5,
        new_delay: 6,
      };

      const paymentPri = alertPriorityMap['payment_pending'];
      const statusPri = statusAlert.type ? alertPriorityMap[statusAlert.type] : 99;

      if (paymentPri < statusPri) {
        return paymentAlert;
      }
    }
  }

  return statusAlert;
}
