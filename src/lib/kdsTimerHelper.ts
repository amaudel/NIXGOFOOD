import { OrderStatus, DeliveryMethod } from '@/types';
import { KDS_TIMING, KdsTimeAnalysis, KdsSeverity } from '@/config/kdsTiming';

export function calculateKdsTimeAnalysis(
  createdAtStr: string,
  now: Date,
  status: OrderStatus,
  deliveryMethod?: DeliveryMethod,
  readyAtStr?: string
): KdsTimeAnalysis {
  // Validate createdAt date
  if (!createdAtStr) {
    return {
      elapsedMinutes: 0,
      formattedTime: '—',
      severity: 'none',
      badgeLabel: '—',
      ariaText: 'Fecha no disponible',
    };
  }

  const createdDate = new Date(createdAtStr);
  if (isNaN(createdDate.getTime())) {
    return {
      elapsedMinutes: 0,
      formattedTime: '—',
      severity: 'none',
      badgeLabel: '—',
      ariaText: 'Fecha inválida',
    };
  }

  // Calculate elapsed minutes (handle slight future skew safely)
  const diffMs = now.getTime() - createdDate.getTime();
  const elapsedMinutes = diffMs < 0 ? 0 : Math.floor(diffMs / (1000 * 60));

  // Format time string
  let formattedTime = 'Ahora';
  if (elapsedMinutes === 1) {
    formattedTime = 'Hace 1 min';
  } else if (elapsedMinutes >= 2 && elapsedMinutes < 60) {
    formattedTime = `Hace ${elapsedMinutes} min`;
  } else if (elapsedMinutes >= 60) {
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    formattedTime = mins > 0 ? `Hace ${hours}h ${mins}min` : `Hace ${hours}h`;
  }

  // Handle Terminal / Inactive statuses
  if (status === 'delivered' || status === 'cancelled') {
    return {
      elapsedMinutes,
      formattedTime,
      severity: 'none',
      badgeLabel: status === 'delivered' ? 'Entregado' : 'Cancelado',
      subLabel: formattedTime,
      ariaText: `Pedido ${status === 'delivered' ? 'entregado' : 'cancelado'}. ${formattedTime}`,
    };
  }

  // Handle 'on_the_way' status
  if (status === 'on_the_way') {
    return {
      elapsedMinutes,
      formattedTime,
      severity: 'none',
      badgeLabel: 'En camino',
      subLabel: `Pedido hace ${elapsedMinutes < 1 ? '<1' : elapsedMinutes} min`,
      ariaText: `Pedido en camino. Creado hace ${elapsedMinutes} minutos.`,
    };
  }

  // Handle 'ready' status
  if (status === 'ready') {
    const readyLabel = deliveryMethod === 'pickup' ? 'Listo para retirar' : 'Listo';
    let readySubLabel = `Pedido hace ${elapsedMinutes < 1 ? '<1' : elapsedMinutes} min`;

    if (readyAtStr) {
      const readyDate = new Date(readyAtStr);
      if (!isNaN(readyDate.getTime())) {
        const readyDiffMs = now.getTime() - readyDate.getTime();
        const readyMins = readyDiffMs < 0 ? 0 : Math.floor(readyDiffMs / (1000 * 60));
        readySubLabel = `Listo hace ${readyMins < 1 ? '<1' : readyMins} min`;
      }
    }

    return {
      elapsedMinutes,
      formattedTime,
      severity: 'none',
      badgeLabel: readyLabel,
      subLabel: readySubLabel,
      ariaText: `Pedido ${readyLabel}. ${readySubLabel}.`,
    };
  }

  // Handle 'new' status (Unaccepted Priority)
  if (status === 'new') {
    if (elapsedMinutes <= KDS_TIMING.newStatusWarningMinutes) {
      return {
        elapsedMinutes,
        formattedTime,
        severity: 'normal',
        badgeLabel: 'NUEVO',
        subLabel: formattedTime,
        ariaText: `Nuevo pedido recibido. ${formattedTime}.`,
      };
    } else if (elapsedMinutes <= KDS_TIMING.newStatusCriticalMinutes) {
      return {
        elapsedMinutes,
        formattedTime,
        severity: 'warning',
        badgeLabel: `SIN ACEPTAR · ${elapsedMinutes} min`,
        subLabel: `Recibido hace ${elapsedMinutes} min`,
        ariaText: `Atención: Pedido sin aceptar hace ${elapsedMinutes} minutos.`,
      };
    } else if (elapsedMinutes <= KDS_TIMING.newStatusUrgentMinutes) {
      return {
        elapsedMinutes,
        formattedTime,
        severity: 'critical',
        badgeLabel: `⚠️ SIN ACEPTAR · ${elapsedMinutes} min`,
        subLabel: `Recibido hace ${elapsedMinutes} min`,
        ariaText: `Advertencia: Pedido sin aceptar hace ${elapsedMinutes} minutos. Se requiere acción.`,
      };
    } else {
      return {
        elapsedMinutes,
        formattedTime,
        severity: 'urgent',
        badgeLabel: `🔴 URGENTE · ${elapsedMinutes} min`,
        subLabel: `Sin aceptar hace ${elapsedMinutes} min`,
        ariaText: `Urgente: Pedido acumulando ${elapsedMinutes} minutos sin aceptar. Prioridad máxima.`,
      };
    }
  }

  // Handle 'preparing' status
  if (elapsedMinutes <= KDS_TIMING.warningMinutes) {
    return {
      elapsedMinutes,
      formattedTime,
      severity: 'normal',
      badgeLabel: `En preparación`,
      subLabel: `Pedido hace ${elapsedMinutes < 1 ? '<1' : elapsedMinutes} min`,
      ariaText: `Pedido en preparación. Creado hace ${elapsedMinutes} minutos.`,
    };
  } else if (elapsedMinutes <= KDS_TIMING.criticalMinutes) {
    return {
      elapsedMinutes,
      formattedTime,
      severity: 'warning',
      badgeLabel: `🟡 Atención · ${elapsedMinutes} min`,
      subLabel: `Pedido hace ${elapsedMinutes} min`,
      ariaText: `Atención: Pedido en preparación acumula ${elapsedMinutes} minutos desde recibido.`,
    };
  } else {
    return {
      elapsedMinutes,
      formattedTime,
      severity: 'critical',
      badgeLabel: `🔴 Demorado · ${elapsedMinutes} min`,
      subLabel: `Pedido hace ${elapsedMinutes} min`,
      ariaText: `Demorado: Pedido en preparación acumula ${elapsedMinutes} minutos desde recibido. Requiere agilizar la entrega.`,
    };
  }
}
