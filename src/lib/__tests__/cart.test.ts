import { describe, it, expect } from 'vitest';
import { mergeCartItem, hasChoosableOptions } from '@/lib/cart';
import { CartItem, Product, SelectedModifier } from '@/types';

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

function itemNuevo(overrides: Partial<Omit<CartItem, 'id'>> = {}): Omit<CartItem, 'id'> {
  return {
    product: producto(),
    quantity: 1,
    selectedModifiers: [],
    notes: '',
    unitPrice: 2,
    totalPrice: 2,
    ...overrides,
  };
}

describe('hasChoosableOptions', () => {
  it('no hay nada que elegir si el producto no trae grupos', () => {
    expect(hasChoosableOptions(producto())).toBe(false);
  });

  it('no hay nada que elegir si trae un arreglo vacio', () => {
    expect(hasChoosableOptions(producto({ modifierGroups: [] }))).toBe(false);
  });

  it('hay algo que elegir si trae al menos un grupo con modificadores', () => {
    expect(
      hasChoosableOptions(
        producto({
          modifierGroups: [
            {
              id: 'g1',
              name: 'Tamaño',
              required: false,
              maxSelect: 1,
              modifiers: [{ id: 'm1', name: 'Grande', price: 0.5, isAvailable: true }],
            },
          ],
        })
      )
    ).toBe(true);
  });
});

describe('mergeCartItem', () => {
  it('agrega una linea nueva a un carrito vacio', () => {
    const resultado = mergeCartItem([], itemNuevo());

    expect(resultado).toHaveLength(1);
    expect(resultado[0].quantity).toBe(1);
    expect(resultado[0].totalPrice).toBe(2);
  });

  it('suma la cantidad en vez de duplicar la linea cuando el producto es identico', () => {
    const carritoConUno = mergeCartItem([], itemNuevo());

    const resultado = mergeCartItem(carritoConUno, itemNuevo());

    expect(resultado).toHaveLength(1);
    expect(resultado[0].quantity).toBe(2);
    expect(resultado[0].totalPrice).toBe(4);
  });

  it('conserva el id de la linea existente al fusionar', () => {
    const carritoConUno = mergeCartItem([], itemNuevo());
    const idOriginal = carritoConUno[0].id;

    const resultado = mergeCartItem(carritoConUno, itemNuevo());

    expect(resultado[0].id).toBe(idOriginal);
  });

  it('no fusiona el mismo producto con modificadores distintos', () => {
    const modSinHielo: SelectedModifier = {
      groupId: 'g1',
      groupName: 'Hielo',
      modifierId: 'sin_hielo',
      modifierName: 'Sin hielo',
      price: 0,
    };

    const carrito = mergeCartItem([], itemNuevo());
    const resultado = mergeCartItem(
      carrito,
      itemNuevo({ selectedModifiers: [modSinHielo], unitPrice: 2, totalPrice: 2 })
    );

    expect(resultado).toHaveLength(2);
  });

  it('no fusiona el mismo producto con la misma opcion en distinto orden', () => {
    const modA: SelectedModifier = {
      groupId: 'g1',
      groupName: 'Extras',
      modifierId: 'queso',
      modifierName: 'Extra queso',
      price: 0.75,
    };
    const modB: SelectedModifier = {
      groupId: 'g2',
      groupName: 'Salsas',
      modifierId: 'picante',
      modifierName: 'Salsa picante',
      price: 0,
    };

    const carrito = mergeCartItem([], itemNuevo({ selectedModifiers: [modA, modB] }));
    const resultado = mergeCartItem(
      carrito,
      itemNuevo({ selectedModifiers: [modB, modA] })
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].quantity).toBe(2);
  });

  it('no fusiona el mismo producto con observaciones distintas', () => {
    const carrito = mergeCartItem([], itemNuevo({ notes: 'Sin cebolla' }));

    const resultado = mergeCartItem(carrito, itemNuevo({ notes: 'Con todo' }));

    expect(resultado).toHaveLength(2);
  });

  it('si fusiona, la fusion respeta la cantidad que traiga el item nuevo', () => {
    const carrito = mergeCartItem([], itemNuevo());

    const resultado = mergeCartItem(
      carrito,
      itemNuevo({ quantity: 3, totalPrice: 6 })
    );

    expect(resultado[0].quantity).toBe(4);
    expect(resultado[0].totalPrice).toBe(8);
  });

  it('no toca las demas lineas del carrito', () => {
    const otro = itemNuevo({ product: producto({ id: 'p_otro', name: 'Taco' }) });
    const carrito = mergeCartItem(mergeCartItem([], itemNuevo()), otro);

    const resultado = mergeCartItem(carrito, itemNuevo());

    expect(resultado).toHaveLength(2);
    expect(resultado.find((i) => i.product.id === 'p_otro')?.quantity).toBe(1);
  });
});
