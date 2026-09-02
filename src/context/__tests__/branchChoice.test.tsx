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
      <button
        onClick={() =>
          setDeliveryLocation({
            ...deliveryLocation,
            // ~55 m: sigue dentro de la zona de cualquiera de las dos
            // sucursales, es solo el tipo de ajuste que invita a hacer
            // "mueve el pin hasta la entrada exacta de tu domicilio".
            latitude: deliveryLocation.latitude + 0.0005,
            hasSelectedLocation: true,
          })
        }
      >
        mover el pin
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

// selectedBranch y el costo de envio se resuelven en el mismo commit una vez
// que cada cascada de efectos termina de asentarse, pero pueden pasar por
// mas de un render en el camino (BranchContext -> AppContext -> deliveryFeeResult).
// Comprobar los dos juntos, siempre con waitFor, evita leer un estado
// intermedio de esa cascada como si ya fuera el final.
async function esperarSucursalYEnvio(sucursalEsperada: string, envioEsperado: string) {
  await waitFor(() => {
    expect(screen.getByTestId('sucursal').textContent).toBe(sucursalEsperada);
    expect(screen.getByTestId('envio').textContent).toBe(envioEsperado);
  });
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
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');

    fireEvent.click(screen.getByText('editar tipo de lugar'));

    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');
  });

  it('mantiene el costo de envio de la sucursal elegida', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');

    fireEvent.click(screen.getByText('editar tipo de lugar'));

    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');
  });

  it('no persiste una sucursal distinta a la que eligio el cliente', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');

    fireEvent.click(screen.getByText('editar tipo de lugar'));
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');

    expect(localStorage.getItem('nixgofood_customer_branch')).toBe(SUCURSAL_NORTE);
  });

  it('sobrevive a mover el pin a un punto que la sucursal elegida sigue cubriendo', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );

    fireEvent.click(screen.getByText('elegir norte'));
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');

    fireEvent.click(screen.getByText('mover el pin'));

    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');
  });
});

describe('Sucursal elegida a mano, persistida antes de recargar', () => {
  const CUSTOMER_BRANCH_KEY = 'nixgofood_customer_branch';

  beforeEach(() => {
    localStorage.clear();
    // Simula una sesion anterior: el cliente ya habia elegido Norte a mano y
    // ya tenia un punto de entrega guardado que Norte sigue cubriendo.
    localStorage.setItem(CUSTOMER_BRANCH_KEY, SUCURSAL_NORTE);
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

  it('no revierte a la sucursal mas cercana al recargar la pagina', async () => {
    montar();

    await waitFor(() =>
      expect(screen.getByTestId('sucursal').textContent).not.toBe('cargando')
    );
    // Se comprueba tambien el costo de envio: si el efecto que recotiza al
    // terminar de cargar sucursales llega a auto-seleccionar Matriz por
    // detras, "sucursal" podria alcanzar a mostrar Norte un instante antes
    // de que ese efecto la revierta -- el envio expone ese revert aunque el
    // texto de la sucursal ya haya sido leido.
    await esperarSucursalYEnvio(SUCURSAL_NORTE, '2.75');
  });
});
