// @vitest-environment jsdom
/**
 * Reemplaza el auto-abrir el carrito: un aviso breve que confirma que el
 * producto se agrego, sin tapar el menu, y que se puede usar para saltar
 * directo al carrito si el cliente ya termino de pedir.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { AddedToCartToast } from '@/components/AddedToCartToast';
import { AppContext, CartNotice } from '@/context/AppContext';

function montar(cartNotice: CartNotice | null, overrides: Partial<any> = {}) {
  const dismissCartNotice = vi.fn();
  const setIsCartOpen = vi.fn();

  const value = {
    cartNotice,
    dismissCartNotice,
    setIsCartOpen,
    ...overrides,
  };

  render(
    <AppContext.Provider value={value as any}>
      <AddedToCartToast />
    </AppContext.Provider>
  );

  return { dismissCartNotice, setIsCartOpen };
}

describe('AddedToCartToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('no muestra nada sin un aviso pendiente', () => {
    montar(null);

    expect(screen.queryByText(/agregado/i)).toBeNull();
  });

  it('confirma el producto y la cantidad agregados', () => {
    montar({ productName: 'Gaseosa Cola Helada (500ml)', quantity: 2 });

    expect(screen.getByText(/Gaseosa Cola Helada/i)).toBeTruthy();
    expect(screen.getByText(/2/)).toBeTruthy();
  });

  it('abre el carrito y limpia el aviso al tocar "Ver carrito"', () => {
    const { dismissCartNotice, setIsCartOpen } = montar({
      productName: 'Taco al Pastor',
      quantity: 1,
    });

    fireEvent.click(screen.getByText(/Ver carrito/i));

    expect(setIsCartOpen).toHaveBeenCalledWith(true);
    expect(dismissCartNotice).toHaveBeenCalled();
  });

  it('se retira solo despues de unos segundos', () => {
    const { dismissCartNotice } = montar({ productName: 'Taco al Pastor', quantity: 1 });

    expect(dismissCartNotice).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(dismissCartNotice).toHaveBeenCalled();
  });
});
