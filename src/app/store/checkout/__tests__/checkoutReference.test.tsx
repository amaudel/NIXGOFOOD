// @vitest-environment jsdom
/**
 * El paso de entrega pedia la referencia del domicilio dos veces: una dentro
 * del selector de ubicacion y otra mas abajo en el propio checkout. Solo la
 * segunda viajaba con el pedido, asi que quien llenaba la primera perdia su
 * indicacion sin ningun aviso.
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

const REFERENCIA = 'Casa verde, timbre 2';

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

// A 1 km de la sucursal matriz de Cuenca: cae dentro de "Zona 1 - Cercana".
const ubicacionSinReferencia = {
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

async function avanzarHastaEntrega() {
  fireEvent.click(await screen.findByRole('button', { name: /Continuar con la entrega/i }));
  // El costo de envio se cotiza cuando BranchContext termina de cargar zonas;
  // sin cotizacion disponible el paso de entrega no deja avanzar.
  await screen.findByText(/Ubicación encontrada/i);
}

describe('Referencia del domicilio en el checkout', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carritoGuardado));
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(ubicacionSinReferencia));
    localStorage.setItem(DELIVERY_METHOD_KEY, 'delivery');

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
    vi.restoreAllMocks();
  });

  it('pide la referencia del domicilio una sola vez', async () => {
    montarCheckout();
    await avanzarHastaEntrega();

    const camposReferencia = screen.getAllByPlaceholderText(/Casa blanca/i);

    expect(camposReferencia).toHaveLength(1);
  });

  it('manda al pedido la referencia que escribio el cliente', async () => {
    const crearPedido = vi
      .spyOn(OrderRepository, 'createOrderTransactional')
      .mockResolvedValue({ id: 'o_1', orderNumber: '#1050', trackingToken: 'trk_test', total: 3.5 });

    montarCheckout();
    await avanzarHastaEntrega();

    fireEvent.change(screen.getByPlaceholderText(/Casa blanca/i), {
      target: { value: REFERENCIA },
    });
    fireEvent.change(screen.getByPlaceholderText(/Juan Pérez/i), {
      target: { value: 'Ana Torres' },
    });
    fireEvent.change(screen.getByPlaceholderText(/0991234567/i), {
      target: { value: '0991112222' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar al pago/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Revisar pedido/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar pedido/i }));

    await waitFor(() => expect(crearPedido).toHaveBeenCalledTimes(1));

    const payload = crearPedido.mock.calls[0][0];
    expect(payload.deliveryLocation.reference).toBe(REFERENCIA);
  });
});
