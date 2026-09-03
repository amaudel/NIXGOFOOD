import { Order, OrderStatus } from '@/types';

/**
 * Estados que ocupan la cocina. Un pedido listo, en camino, entregado o
 * cancelado ya no le saca capacidad a nadie.
 */
export const ESTADOS_PENDIENTES: OrderStatus[] = ['new', 'preparing'];

/**
 * Solo cuentan los pedidos de las ultimas horas.
 *
 * Sin este corte, un pedido que alguien olvido cerrar quedaria sumando
 * carga para siempre e inflaria los tiempos todos los dias: la funcion se
 * degradaria sola con el uso.
 */
export const VENTANA_HORAS = 4;

/**
 * Carga de cocina: cuantos items hay pendientes de preparar.
 *
 * Se cuentan items y no pedidos porque es lo fiel a una cocina: tres
 * pedidos de veinte tacos cargan muchisimo mas que diez de una gaseosa.
 */
export function contarItemsPendientes(
  pedidos: Order[],
  ahora: Date = new Date()
): number {
  const corte = ahora.getTime() - VENTANA_HORAS * 60 * 60 * 1000;

  return pedidos.reduce((total, pedido) => {
    if (!ESTADOS_PENDIENTES.includes(pedido.status)) return total;
    if (new Date(pedido.createdAt).getTime() < corte) return total;

    const items = pedido.items || [];
    return total + items.reduce((suma, item) => suma + (item.quantity || 0), 0);
  }, 0);
}
