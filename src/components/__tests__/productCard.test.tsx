// @vitest-environment jsdom
/**
 * La mitad del catalogo (bebidas, combos, quesadillas, papas) no tiene
 * grupos de modificadores y aun asi abria la ficha a pantalla completa,
 * donde lo unico que habia era un campo de observaciones -- dos toques
 * donde alcanzaba uno. "Agregar" ahora agrega directo cuando no hay nada
 * que elegir, y sigue abriendo la ficha cuando si lo hay.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { ProductCard } from '@/components/ProductCard';
import { Product } from '@/types';

function producto(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p_coca_cola',
    businessId: 'b1',
    categoryId: 'cat_drinks',
    name: 'Gaseosa Cola Helada (500ml)',
    description: 'Bebida de cola helada.',
    price: 2,
    image: '/demo/products/coca-cola.webp',
    isAvailable: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe('ProductCard, boton Agregar', () => {
  it('agrega directo cuando el producto no tiene opciones que elegir', () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <ProductCard product={producto()} onSelect={onSelect} onQuickAdd={onQuickAdd} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agregar/i }));

    expect(onQuickAdd).toHaveBeenCalledWith(producto());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('abre la ficha cuando el producto tiene opciones que elegir', () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    const productoConOpciones = producto({
      modifierGroups: [
        {
          id: 'g1',
          name: 'Proteína',
          required: true,
          maxSelect: 1,
          modifiers: [{ id: 'm1', name: 'Res', price: 0, isAvailable: true }],
        },
      ],
    });

    render(
      <ProductCard product={productoConOpciones} onSelect={onSelect} onQuickAdd={onQuickAdd} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agregar/i }));

    expect(onSelect).toHaveBeenCalledWith(productoConOpciones);
    expect(onQuickAdd).not.toHaveBeenCalled();
  });

  it('tocar la tarjeta (no el boton) siempre abre la ficha, incluso sin opciones', () => {
    const onSelect = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <ProductCard product={producto()} onSelect={onSelect} onQuickAdd={onQuickAdd} />
    );

    fireEvent.click(screen.getByText('Bebida de cola helada.'));

    expect(onSelect).toHaveBeenCalledWith(producto());
    expect(onQuickAdd).not.toHaveBeenCalled();
  });
});
