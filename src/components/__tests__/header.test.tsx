// @vitest-environment jsdom
/**
 * El boton de carrito del Header ya no abre el CartDrawer -- lleva
 * directo a /checkout, que ya permite editar cantidades y ver el resumen.
 * El drawer completo (mismo contenido, un paso extra) quedaba redundante
 * como parada intermedia para quien ya decidio continuar.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { Header } from '@/components/Header';
import { AppContext } from '@/context/AppContext';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: () => '/',
}));

vi.mock('@/components/OrderLookupModal', () => ({
  OrderLookupModal: () => null,
}));

function montar(overrides: Partial<any> = {}) {
  const setIsCartOpen = vi.fn();
  const value = {
    cartTotalCount: 2,
    cartSubtotal: 15.5,
    setIsCartOpen,
    business: { name: 'El Taco Nijo', slogan: 'Rico y rapido' },
    catalogLoading: false,
    storeStatus: { isOpen: true },
    ...overrides,
  };

  render(
    <AppContext.Provider value={value as any}>
      <Header />
    </AppContext.Provider>
  );

  return { setIsCartOpen };
}

describe('Header - boton de carrito', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('navega directo a /checkout en vez de abrir el drawer', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() } as any);

    const { setIsCartOpen } = montar();

    fireEvent.click(screen.getByLabelText('Ver carrito'));

    expect(push).toHaveBeenCalledWith('/checkout');
    expect(setIsCartOpen).not.toHaveBeenCalled();
  });
});
