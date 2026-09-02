import { CartItem, Product, SelectedModifier } from '@/types';

/** Si hay algo que el cliente pueda elegir antes de agregar el producto. */
export function hasChoosableOptions(product: Product): boolean {
  return !!product.modifierGroups && product.modifierGroups.length > 0;
}

/**
 * Clave estable de un set de modificadores: ordena por id de modificador
 * para que "queso + picante" y "picante + queso" cuenten como lo mismo.
 */
function claveModificadores(mods: SelectedModifier[]): string {
  return [...mods]
    .map((m) => m.modifierId)
    .sort()
    .join('|');
}

function mismaLinea(a: CartItem | Omit<CartItem, 'id'>, b: Omit<CartItem, 'id'>): boolean {
  return (
    a.product.id === b.product.id &&
    claveModificadores(a.selectedModifiers) === claveModificadores(b.selectedModifiers) &&
    (a.notes || '').trim() === (b.notes || '').trim()
  );
}

/**
 * Agrega un producto al carrito. Si ya hay una linea identica -- mismo
 * producto, mismas opciones elegidas, misma observacion -- suma la cantidad
 * ahi en vez de crear una linea nueva. Antes cada toque en "Agregar" abria
 * una linea propia, asi que pedir dos gaseosas iguales dejaba "1 x Gaseosa"
 * repetido dos veces en el carrito, en la confirmacion y en la comanda de
 * cocina, en vez de un solo "2 x Gaseosa".
 *
 * Dos observaciones distintas para el mismo producto ("sin cebolla" y "con
 * todo") no se fusionan a proposito: son pedidos que la cocina debe
 * preparar distinto.
 */
export function mergeCartItem(cart: CartItem[], item: Omit<CartItem, 'id'>): CartItem[] {
  const indice = cart.findIndex((existente) => mismaLinea(existente, item));

  if (indice === -1) {
    const nuevaLinea: CartItem = {
      ...item,
      id: `${item.product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    };
    return [...cart, nuevaLinea];
  }

  return cart.map((existente, i) =>
    i === indice
      ? {
          ...existente,
          quantity: existente.quantity + item.quantity,
          totalPrice: existente.totalPrice + item.totalPrice,
        }
      : existente
  );
}
