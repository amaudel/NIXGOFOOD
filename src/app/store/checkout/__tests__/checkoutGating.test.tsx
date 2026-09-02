// @vitest-environment jsdom
/**
 * Dos candados que faltaban en el camino de compra:
 *
 * - "Direccion principal *" llevaba asterisco de obligatorio pero no se
 *   validaba nunca, asi que se podia mandar un pedido a domicilio con la
 *   direccion en blanco y el repartidor se quedaba solo con el pin.
 * - El header calculaba el horario y mostraba "Cerrado", pero nada en el
 *   checkout consultaba ese estado: el cliente podia pagar y quedarse
 *   esperando una comanda que nadie iba a ver hasta el dia siguiente.
 *
 * Checkout de una sola pantalla: toda la validacion corre de una vez al
 * tocar "Confirmar pedido", no hay pasos que avanzar.
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
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import CheckoutPage from '@/app/store/checkout/page';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const MATRIZ = 'b0000000-0000-0000-0000-000000000002';
const NORTE = 'b0000000-0000-0000-0000-000000000003';
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

const puntoElegido = {
  latitude: -2.905,
  longitude: -79.012,
  locationType: 'Casa',
  hasSelectedLocation: true,
};

// Cerrado todos los dias: el resultado no depende de la hora en que corran
// los tests.
const cerradoSiempre = [MATRIZ, NORTE].flatMap((branchId) =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    id: `cerrado_${branchId}_${dayOfWeek}`,
    businessId: BUSINESS_ID,
    branchId,
    dayOfWeek,
    openTime: '09:00:00',
    closeTime: '23:00:00',
    closed: true,
  }))
);

function montarCheckout() {
  return render(
    <BranchProvider scope="customer" businessId={BUSINESS_ID}>
      <AppProvider businessId={BUSINESS_ID}>
        <CheckoutPage />
      </AppProvider>
    </BranchProvider>
  );
}

async function esperarCotizacion() {
  await screen.findByText(/Ubicación encontrada/i);
}

function llenarContacto() {
  fireEvent.change(screen.getByPlaceholderText(/Juan Pérez/i), {
    target: { value: 'Ana Torres' },
  });
  fireEvent.change(screen.getByPlaceholderText(/0991234567/i), {
    target: { value: '0991112222' },
  });
}

// Hay un boton por breakpoint (escritorio y barra fija de movil); ambos
// disparan el mismo envio, asi que cualquiera sirve para la prueba.
function confirmarPedido() {
  const boton = screen.getAllByRole('button', { name: /Confirmar pedido|Local cerrado/i })[0];
  fireEvent.click(boton);
  return boton as HTMLButtonElement;
}

function sembrarPedido(address: string) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carritoGuardado));
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ ...puntoElegido, address }));
  localStorage.setItem(DELIVERY_METHOD_KEY, 'delivery');
}

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
  vi.restoreAllMocks();
});

describe('Dirección de entrega obligatoria', () => {
  it('no crea el pedido con la dirección en blanco', async () => {
    const crearPedido = vi
      .spyOn(OrderRepository, 'createOrderTransactional')
      .mockResolvedValue({ id: 'o_1', orderNumber: '#1050', trackingToken: 'trk', total: 3.5 });

    sembrarPedido('');
    montarCheckout();
    await esperarCotizacion();
    llenarContacto();

    confirmarPedido();

    expect(await screen.findByText(/Escribe la dirección de entrega/i)).toBeTruthy();
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('deja pasar cuando la dirección está completa', async () => {
    const crearPedido = vi
      .spyOn(OrderRepository, 'createOrderTransactional')
      .mockResolvedValue({ id: 'o_1', orderNumber: '#1050', trackingToken: 'trk', total: 3.5 });

    sembrarPedido('Av. Fray Vicente Solano 5-30');
    montarCheckout();
    await esperarCotizacion();
    llenarContacto();

    confirmarPedido();

    await waitFor(() => expect(crearPedido).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Escribe la dirección de entrega/i)).toBeNull();
  });
});

describe('Local cerrado', () => {
  beforeEach(() => {
    vi.spyOn(DemoBusinessRepository, 'getBusinessHours').mockResolvedValue(cerradoSiempre);
  });

  it('avisa que está cerrado antes de que el cliente llene nada', async () => {
    sembrarPedido('Av. Fray Vicente Solano 5-30');
    montarCheckout();

    expect(await screen.findByText(/Ahora mismo el local está cerrado/i)).toBeTruthy();
  });

  it('no crea el pedido con el local cerrado', async () => {
    const crearPedido = vi
      .spyOn(OrderRepository, 'createOrderTransactional')
      .mockResolvedValue({ id: 'o_1', orderNumber: '#1050', trackingToken: 'trk', total: 3.5 });

    sembrarPedido('Av. Fray Vicente Solano 5-30');
    montarCheckout();
    await esperarCotizacion();
    llenarContacto();

    const boton = (await screen.findAllByRole('button', { name: /Local cerrado/i })) as HTMLButtonElement[];
    expect(boton[0].disabled).toBe(true);

    confirmarPedido();

    await waitFor(() =>
      expect(screen.getByText(/Ahora mismo el local está cerrado/i)).toBeTruthy()
    );
    expect(crearPedido).not.toHaveBeenCalled();
  });
});

describe('Horario todavia cargando', () => {
  it('no crea el pedido mientras el horario real no ha resuelto, aunque el local este cerrado', async () => {
    // El fetch de horarios queda pendiente a proposito: simula la ventana
    // entre el montaje del checkout y que Promise.allSettled resuelva.
    // storeStatus por defecto es "abierto" en ese hueco (sin horas
    // cargadas todavia no hay forma de saber lo contrario) -- un cliente
    // recurrente con nombre/telefono/direccion ya guardados podia tocar
    // "Confirmar pedido" dentro de esa ventana y el pedido se creaba igual,
    // aunque el local estuviera cerrado.
    let resolverHorario: (value: any) => void = () => {};
    vi.spyOn(DemoBusinessRepository, 'getBusinessHours').mockReturnValue(
      new Promise((resolve) => {
        resolverHorario = resolve;
      })
    );
    const crearPedido = vi
      .spyOn(OrderRepository, 'createOrderTransactional')
      .mockResolvedValue({ id: 'o_1', orderNumber: '#1050', trackingToken: 'trk', total: 3.5 });

    sembrarPedido('Av. Fray Vicente Solano 5-30');
    montarCheckout();
    await esperarCotizacion();
    llenarContacto();

    confirmarPedido();

    // Le da tiempo a cualquier promesa ya resuelta de asentarse, sin
    // resolver todavia la de horarios.
    await new Promise((r) => setTimeout(r, 0));
    expect(crearPedido).not.toHaveBeenCalled();

    resolverHorario(cerradoSiempre);
    await waitFor(() =>
      expect(screen.getByText(/Ahora mismo el local está cerrado/i)).toBeTruthy()
    );
    expect(crearPedido).not.toHaveBeenCalled();
  });
});
