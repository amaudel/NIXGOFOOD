// @vitest-environment jsdom
/**
 * Escribir la direccion es metadata del domicilio, no elegir un punto en el
 * mapa. Cuando el campo disparaba una cotizacion, el cliente recibia
 * "fuera de nuestra zona de delivery" apenas tecleaba la primera letra:
 * se cotizaba contra las coordenadas iniciales (0, 0).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Leaflet no monta en jsdom y el mapa no es lo que se prueba aca.
vi.mock('@/components/RealMapWrapper', () => ({
  RealMapWrapper: () => null,
}));

import { BranchProvider } from '@/context/BranchContext';
import { AppProvider } from '@/context/AppContext';
import { LocationPicker } from '@/components/LocationPicker';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';

function montarPicker() {
  return render(
    <BranchProvider scope="customer" businessId={BUSINESS_ID}>
      <AppProvider businessId={BUSINESS_ID}>
        <LocationPicker />
      </AppProvider>
    </BranchProvider>
  );
}

describe('LocationPicker, antes de elegir un punto en el mapa', () => {
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

  it('no rechaza al cliente por escribir su direccion', async () => {
    montarPicker();

    fireEvent.change(screen.getByLabelText(/Direccion principal|Dirección principal/i), {
      target: { value: 'Av. Solano 5-30' },
    });

    expect(screen.queryByText(/fuera de nuestra zona de delivery/i)).toBeNull();
    expect(screen.queryByText(/Ninguna de nuestras sucursales llega/i)).toBeNull();
  });

  it('sigue pidiendo la ubicacion despues de escribir la direccion', async () => {
    montarPicker();

    fireEvent.change(screen.getByLabelText(/Direccion principal|Dirección principal/i), {
      target: { value: 'Av. Solano 5-30' },
    });

    expect(
      screen.getByText(/Selecciona tu ubicación para calcular el delivery/i)
    ).toBeTruthy();
  });

  it('conserva lo que el cliente escribio en la referencia', async () => {
    montarPicker();

    fireEvent.change(screen.getByLabelText(/Referencia de entrega/i), {
      target: { value: 'Casa verde, timbre 2' },
    });

    expect(
      (screen.getByLabelText(/Referencia de entrega/i) as HTMLInputElement).value
    ).toBe('Casa verde, timbre 2');
    expect(screen.queryByText(/fuera de nuestra zona de delivery/i)).toBeNull();
  });
});
