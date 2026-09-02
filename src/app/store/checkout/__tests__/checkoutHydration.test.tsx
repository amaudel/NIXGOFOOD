// @vitest-environment jsdom
/**
 * El carrito vive en localStorage y AppProvider lo restaura en un efecto, o
 * sea DESPUES del primer render. Entrar directo a /checkout (recargar, "atras",
 * abrir el enlace en otra pestana) monta la pagina con el carrito todavia
 * vacio y recien en el segundo render aparecen los productos.
 *
 * Estos tests cubren esa transicion vacio -> con productos, que es donde la
 * pagina reventaba con "Rendered more hooks than during the previous render":
 * el early return del carrito vacio cortaba antes de un useRef declarado mas
 * abajo. Al tirarse el arbol, el commit no completaba y la escritura que
 * devolvia el carrito a localStorage nunca corria: el pedido se perdia.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { BranchProvider } from '@/context/BranchContext';
import { AppProvider } from '@/context/AppContext';
import CheckoutPage from '@/app/store/checkout/page';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CART_STORAGE_KEY = 'el_taca_nijo_cart';

const carritoGuardado = [
  {
    id: 'ci_1',
    product: {
      id: 'p_coca_cola',
      name: 'Gaseosa Cola Helada (500ml)',
      image: '/demo/products/coca-cola.webp',
      price: 2,
    },
    quantity: 1,
    selectedModifiers: [],
    notes: '',
    unitPrice: 2,
    totalPrice: 2,
  },
];

function montarCheckout() {
  return render(
    <BranchProvider scope="customer" businessId={BUSINESS_ID}>
      <AppProvider businessId={BUSINESS_ID}>
        <CheckoutPage />
      </AppProvider>
    </BranchProvider>
  );
}

describe('Checkout abierto en frio, con el carrito en localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carritoGuardado));

    // AppProvider pide la lista de pedidos al montar. En la tienda publica esa
    // consulta la rechaza RLS a proposito y el provider ya la ignora; aca solo
    // se corta para que el test no dependa de la red ni ensucie la salida.
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

  it('muestra los productos del carrito restaurado', async () => {
    montarCheckout();

    expect(await screen.findByText(/Tu Comanda/i)).toBeTruthy();
    expect(await screen.findByText(/Gaseosa Cola Helada/i)).toBeTruthy();
  });

  it('no borra el carrito guardado al montar', async () => {
    montarCheckout();

    await screen.findByText(/Tu Comanda/i);

    const guardado = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    expect(guardado).toHaveLength(1);
    expect(guardado[0].product.id).toBe('p_coca_cola');
  });
});

/**
 * AppProvider persiste el carrito en un efecto con dependencia [cart]. Ese
 * efecto corre tambien en el primer commit, cuando el carrito todavia esta
 * vacio, y pisaba lo guardado con "[]" antes de que el efecto de hidratacion
 * alcanzara a restaurarlo. Con un solo montaje el siguiente commit lo
 * reescribia y no se notaba; si el arbol se monta dos veces (StrictMode en
 * desarrollo, o cualquier remount), la segunda lectura ya encontraba "[]" y
 * el pedido del cliente desaparecia.
 */
describe('Checkout montado dos veces (StrictMode)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carritoGuardado));
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

  it('conserva el carrito guardado', async () => {
    render(
      <React.StrictMode>
        <BranchProvider scope="customer" businessId={BUSINESS_ID}>
          <AppProvider businessId={BUSINESS_ID}>
            <CheckoutPage />
          </AppProvider>
        </BranchProvider>
      </React.StrictMode>
    );

    expect(await screen.findByText(/Gaseosa Cola Helada/i)).toBeTruthy();

    const guardado = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    expect(guardado).toHaveLength(1);
  });
});
