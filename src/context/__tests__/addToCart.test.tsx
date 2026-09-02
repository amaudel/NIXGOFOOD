// @vitest-environment jsdom
/**
 * Antes, cada toque en "Agregar" abria una linea nueva del carrito (aunque
 * el producto y las opciones fueran identicos a una ya existente) y ademas
 * abria el panel del carrito tapando el menu -- quien pedia cuatro tacos
 * tenia que cerrar el panel y volver a buscar donde estaba cada vez.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { BranchProvider } from '@/context/BranchContext';
import { AppProvider, useApp } from '@/context/AppContext';
import { Product } from '@/types';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';

const gaseosa: Product = {
  id: 'p_coca_cola',
  businessId: BUSINESS_ID,
  categoryId: 'cat_drinks',
  name: 'Gaseosa Cola Helada (500ml)',
  description: 'Bebida de cola helada.',
  price: 2,
  image: '/demo/products/coca-cola.webp',
  isAvailable: true,
};

const taco: Product = {
  id: 'p_taco_pastor',
  businessId: BUSINESS_ID,
  categoryId: 'cat_tacos',
  name: 'Taco al Pastor',
  description: 'Cerdo adobado al trompo.',
  price: 3.25,
  image: '/demo/products/taco-pastor.webp',
  isAvailable: true,
};

function itemDe(product: Product) {
  return {
    product,
    quantity: 1,
    selectedModifiers: [],
    notes: '',
    unitPrice: product.price,
    totalPrice: product.price,
  };
}

function Probe() {
  const { cart, isCartOpen, addToCart } = useApp();

  return (
    <div>
      <span data-testid="lineas">{cart.length}</span>
      <span data-testid="cantidad-gaseosa">
        {cart.find((i) => i.product.id === 'p_coca_cola')?.quantity ?? 0}
      </span>
      <span data-testid="carrito-abierto">{isCartOpen ? 'si' : 'no'}</span>
      <button onClick={() => addToCart(itemDe(gaseosa))}>agregar gaseosa</button>
      <button onClick={() => addToCart(itemDe(taco))}>agregar taco</button>
    </div>
  );
}

function montar() {
  return render(
    <BranchProvider scope="customer" businessId={BUSINESS_ID}>
      <AppProvider businessId={BUSINESS_ID}>
        <Probe />
      </AppProvider>
    </BranchProvider>
  );
}

describe('addToCart', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    );
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('suma la cantidad al agregar el mismo producto otra vez, en vez de duplicar la linea', async () => {
    montar();

    fireEvent.click(screen.getByText('agregar gaseosa'));
    fireEvent.click(screen.getByText('agregar gaseosa'));

    await waitFor(() => expect(screen.getByTestId('cantidad-gaseosa').textContent).toBe('2'));
    expect(screen.getByTestId('lineas').textContent).toBe('1');
  });

  it('mantiene lineas separadas para productos distintos', async () => {
    montar();

    fireEvent.click(screen.getByText('agregar gaseosa'));
    fireEvent.click(screen.getByText('agregar taco'));

    await waitFor(() => expect(screen.getByTestId('lineas').textContent).toBe('2'));
  });

  it('no abre el carrito al agregar un producto', async () => {
    montar();

    fireEvent.click(screen.getByText('agregar gaseosa'));

    await waitFor(() => expect(screen.getByTestId('lineas').textContent).toBe('1'));
    expect(screen.getByTestId('carrito-abierto').textContent).toBe('no');
  });
});
