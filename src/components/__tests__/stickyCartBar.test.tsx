// @vitest-environment jsdom
/**
 * La barra fija de carrito (movil) tambien lleva directo a /checkout en
 * vez de abrir el drawer -- mismo motivo que el boton del Header.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { StickyCartBar } from '@/components/StickyCartBar';
import { AppContext } from '@/context/AppContext';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

function montar(overrides: Partial<any> = {}) {
  const setIsCartOpen = vi.fn();
  const value = {
    cartTotalCount: 3,
    cartSubtotal: 22,
    setIsCartOpen,
    isCartOpen: false,
    ...overrides,
  };

  render(
    <AppContext.Provider value={value as any}>
      <StickyCartBar />
    </AppContext.Provider>
  );

  return { setIsCartOpen };
}

describe('StickyCartBar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('navega directo a /checkout en vez de abrir el drawer', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() } as any);

    const { setIsCartOpen } = montar();

    fireEvent.click(screen.getByText(/Ver tu pedido/i));

    expect(push).toHaveBeenCalledWith('/checkout');
    expect(setIsCartOpen).not.toHaveBeenCalled();
  });
});
