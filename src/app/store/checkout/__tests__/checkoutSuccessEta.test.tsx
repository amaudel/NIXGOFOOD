// @vitest-environment jsdom
/**
 * La pantalla de "¡Pedido Recibido!" es el momento de mas ansiedad del
 * cliente y no decia cuanto iba a tardar, aunque el dato ya existia --
 * deliveryFeeResult.estimatedMinutes se calcula antes de confirmar y la
 * pagina de seguimiento lo muestra bien grande.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/components/RealMapWrapper', () => ({
  RealMapWrapper: () => null,
}));

import { BranchProvider } from '@/context/BranchContext';
import { AppProvider } from '@/context/AppContext';
import { OrderRepository } from '@/repositories/OrderRepository';
import CheckoutPage from '@/app/store/checkout/page';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CART_STORAGE_KEY = 'el_taca_nijo_cart';
const LOCATION_STORAGE_KEY = 'el_taca_nijo_location';
const DELIVERY_METHOD_KEY = 'el_taca_nijo_delivery_method';

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

// A 1 km de la Matriz: cae en "Zona 1 - Cercana", estimatedMinutes '20-30 min'.
const puntoEnZona1 = {
  latitude: -2.905,
  longitude: -79.012,
  address: 'Av. Solano 5-30',
  locationType: 'Casa',
  hasSelectedLocation: true,
};

function montarCheckout() {
  return render(
    <BranchProvider scope="customer" businessId={BUSINESS_ID}>
      <AppProvider businessId={BUSINESS_ID}>
        <CheckoutPage />
      </AppProvider>
    </BranchProvider>
  );
}

function confirmarPedido() {
  fireEvent.click(screen.getAllByRole('button', { name: /Confirmar pedido/i })[0]);
}

function llenarContacto() {
  fireEvent.change(screen.getByPlaceholderText(/Juan Pérez/i), { target: { value: 'Ana Torres' } });
  fireEvent.change(screen.getByPlaceholderText(/0991234567/i), { target: { value: '0991112222' } });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carritoGuardado));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
  );
  vi.spyOn(OrderRepository, 'createOrderTransactional').mockResolvedValue({
    id: 'o_1',
    orderNumber: '#1050',
    trackingToken: 'trk_test',
    total: 3.5,
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('muestra el tiempo estimado de la zona en la pantalla de éxito (delivery)', async () => {
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(puntoEnZona1));
  localStorage.setItem(DELIVERY_METHOD_KEY, 'delivery');

  montarCheckout();
  await screen.findByText(/Ubicación encontrada/i);
  llenarContacto();
  confirmarPedido();

  // Espera la pantalla de exito -- antes de eso, el propio formulario ya
  // muestra "20-30 min" en la cotizacion de envio, lo que daria un falso
  // verde sin este paso.
  await screen.findByText(/¡Pedido Recibido!/i);
  expect(screen.getByText(/20-30 min/i)).toBeTruthy();
});

it('muestra el tiempo de preparación en la pantalla de éxito (retiro)', async () => {
  localStorage.setItem(DELIVERY_METHOD_KEY, 'pickup');

  montarCheckout();
  llenarContacto();
  confirmarPedido();

  await screen.findByText(/¡Pedido Recibido!/i);
  expect(screen.getByText(/15 - 25 min/i)).toBeTruthy();
});
