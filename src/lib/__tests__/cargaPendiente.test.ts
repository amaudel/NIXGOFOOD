/**
 * Cuenta la carga de la cocina a partir de una lista de pedidos.
 *
 * La usa el panel (que ya tiene los pedidos cargados, en demo y en real).
 * El servidor cuenta lo mismo con SQL por eficiencia, pero comparte de
 * aca los estados y la ventana de tiempo, para que las dos vias no se
 * desincronicen.
 */
import { describe, it, expect } from 'vitest';
import { contarItemsPendientes, VENTANA_HORAS } from '@/lib/cargaPendiente';

const AHORA = new Date('2026-09-03T20:00:00Z');

function hace(minutos: number): string {
  return new Date(AHORA.getTime() - minutos * 60_000).toISOString();
}

function pedido(over: any = {}): any {
  return {
    id: 'o1',
    status: 'new',
    createdAt: hace(10),
    items: [{ quantity: 2 }],
    ...over,
  };
}

describe('contarItemsPendientes', () => {
  it('sin pedidos la cocina esta vacia', () => {
    expect(contarItemsPendientes([], AHORA)).toBe(0);
  });

  it('suma las cantidades, no la cantidad de pedidos', () => {
    const carga = contarItemsPendientes(
      [pedido({ items: [{ quantity: 3 }, { quantity: 4 }] })],
      AHORA
    );

    expect(carga).toBe(7);
  });

  it('cuenta los pedidos nuevos y los que se estan preparando', () => {
    const carga = contarItemsPendientes(
      [
        pedido({ id: 'a', status: 'new', items: [{ quantity: 2 }] }),
        pedido({ id: 'b', status: 'preparing', items: [{ quantity: 3 }] }),
      ],
      AHORA
    );

    expect(carga).toBe(5);
  });

  it('no cuenta lo que ya salio de cocina', () => {
    const carga = contarItemsPendientes(
      [
        pedido({ id: 'a', status: 'ready', items: [{ quantity: 5 }] }),
        pedido({ id: 'b', status: 'on_the_way', items: [{ quantity: 5 }] }),
        pedido({ id: 'c', status: 'delivered', items: [{ quantity: 5 }] }),
        pedido({ id: 'd', status: 'cancelled', items: [{ quantity: 5 }] }),
      ],
      AHORA
    );

    expect(carga).toBe(0);
  });

  it('ignora un pedido viejo que quedo abierto sin cerrar', () => {
    const viejo = pedido({
      status: 'preparing',
      createdAt: hace(VENTANA_HORAS * 60 + 1),
      items: [{ quantity: 99 }],
    });

    expect(contarItemsPendientes([viejo], AHORA)).toBe(0);
  });

  it('cuenta un pedido justo dentro de la ventana', () => {
    const reciente = pedido({
      createdAt: hace(VENTANA_HORAS * 60 - 1),
      items: [{ quantity: 4 }],
    });

    expect(contarItemsPendientes([reciente], AHORA)).toBe(4);
  });

  it('no se rompe con un pedido sin items', () => {
    expect(contarItemsPendientes([pedido({ items: undefined })], AHORA)).toBe(0);
  });

  it('trata una cantidad ausente como cero en vez de romper la suma', () => {
    const carga = contarItemsPendientes(
      [pedido({ items: [{ quantity: 2 }, {} as any] })],
      AHORA
    );

    expect(carga).toBe(2);
  });
});
