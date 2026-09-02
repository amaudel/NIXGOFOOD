// @vitest-environment jsdom
/**
 * Cotizar el envio auto-selecciona la sucursal mas cercana. Eso es correcto
 * cuando el cliente marca un punto nuevo, pero no cuando solo edita la
 * direccion, la referencia o el tipo de lugar: ahi la auto-seleccion pisaba
 * (y persistia) una sucursal que el cliente habia elegido a mano desde
 * BranchPicker, cambiandole de paso el costo de envio.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { BranchProvider, useBranch } from '@/context/BranchContext';
import { AppProvider, useApp } from '@/context/AppContext';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const SUCURSAL_NORTE = 'b0000000-0000-0000-0000-000000000003';
const LOCATION_STORAGE_KEY = 'el_taca_nijo_location';

// A 1.0 km de la Matriz y a ~3.1 km de la Norte: ambas cubren el punto, asi
// que la auto-seleccion elige Matriz y la eleccion manual de Norte es valida.
const puntoElegido = {
  latitude: -2.905,
  longitude: -79.012,
  address: 'Av. Solano 5-30',
  locationType: 'Casa',
  hasSelectedLocation: true,
};

function Probe() {
  const { deliveryLocation, setDeliveryLocation, deliveryFeeResult } = useApp();
  const { selectedBranch, selectBranch, loading } = useBranch();

  return (
    <div>
      <span data-testid="sucursal">{loading ? 'cargando' : selectedBranch?.id ?? 'ninguna'}</span>
      <span data-testid="envio">{deliveryFeeResult.fee.toFixed(2)}</span>
      <button onClick={() => selectBranch(SUCURSAL_NORTE)}>elegir norte</button>
      <button
        onClick={() => setDeliveryLocation({ ...deliveryLocation, locationType: 'Oficina' })}
      >
        editar tipo de lugar
      </button>
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

describe('Sucursal elegida a mano por el cliente', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(puntoElegido));
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

  it('sobrevive a editar el tipo de lugar', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).toBe(SUCURSAL_NORTE)
    );

    fireEvent.click(screen.getByText('editar tipo de lugar'));

    expect(screen.getByTestId('sucursal').textContent).toBe(SUCURSAL_NORTE);
  });

  it('mantiene el costo de envio de la sucursal elegida', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await waitFor(() => expect(screen.getByTestId('envio').textContent).toBe('2.75'));

    fireEvent.click(screen.getByText('editar tipo de lugar'));

    expect(screen.getByTestId('envio').textContent).toBe('2.75');
  });

  it('no persiste una sucursal distinta a la que eligio el cliente', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).toBe(SUCURSAL_NORTE)
    );

    fireEvent.click(screen.getByText('editar tipo de lugar'));

    expect(localStorage.getItem('nixgofood_customer_branch')).toBe(SUCURSAL_NORTE);
  });
});
