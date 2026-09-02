// @vitest-environment jsdom
/**
 * Escribir la direccion es metadata del domicilio, no elegir un punto en el
 * mapa. Cuando el campo disparaba una cotizacion, el cliente recibia
 * "fuera de nuestra zona de delivery" apenas tecleaba la primera letra:
 * se cotizaba contra las coordenadas iniciales (0, 0).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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

/**
 * "Usar mi ubicacion" escribia la latitud y longitud crudas dentro del campo
 * de direccion, pisando lo que el cliente hubiera escrito. Eso era
 * literalmente lo que terminaba viendo el repartidor en su pantalla.
 */
describe('LocationPicker, al marcar un punto', () => {
  function stubGeolocation() {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -2.905, longitude: -79.012 } } as GeolocationPosition),
      },
    });
  }

  function stubFetch(address: string | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/api/geocode/reverse')) {
          return new Response(JSON.stringify({ address }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    );
  }

  beforeEach(() => {
    localStorage.clear();
    stubGeolocation();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('escribe una calle de verdad, no las coordenadas', async () => {
    stubFetch('Avenida Fray Vicente Solano 5-30, El Ejido');
    montarPicker();

    fireEvent.click(screen.getByText(/Usar mi ubicación/i));

    await waitFor(() =>
      expect((screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value).toBe(
        'Avenida Fray Vicente Solano 5-30, El Ejido'
      )
    );
  });

  it('nunca deja coordenadas crudas en el campo de direccion', async () => {
    stubFetch(null);
    montarPicker();

    fireEvent.click(screen.getByText(/Usar mi ubicación/i));

    await waitFor(() =>
      expect(screen.getByText(/Ubicación encontrada|fuera de nuestra zona/i)).toBeTruthy()
    );
    expect((screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value).not.toMatch(
      /-?\d+\.\d{4}/
    );
  });

  it('no pisa la direccion que el cliente escribio a mano', async () => {
    stubFetch('Avenida Fray Vicente Solano 5-30, El Ejido');
    montarPicker();

    fireEvent.change(screen.getByLabelText(/Direcci[oó]n principal/i), {
      target: { value: 'Casa de mi mamá, junto a la tienda' },
    });
    fireEvent.click(screen.getByText(/Usar mi ubicación/i));

    await waitFor(() =>
      expect(screen.getByText(/Ubicación encontrada|fuera de nuestra zona/i)).toBeTruthy()
    );
    expect((screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value).toBe(
      'Casa de mi mamá, junto a la tienda'
    );
  });
});

/**
 * La geocodificacion inversa corre en segundo plano mientras el cliente
 * sigue interactuando con el formulario. Dos carreras posibles:
 *
 * 1. El cliente escribe la referencia mientras la respuesta todavia no
 *    llega; cuando llega, no debe pisar lo que acaba de escribir.
 * 2. El cliente mueve el pin dos veces seguidas y las respuestas llegan
 *    fuera de orden; la mas vieja no debe revertir la posicion mas nueva.
 */
describe('LocationPicker, carreras de la geocodificacion inversa', () => {
  function stubGeolocation(secuenciaDeCoordenadas: Array<{ lat: number; lng: number }>) {
    let llamada = 0;
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) => {
          const { lat, lng } = secuenciaDeCoordenadas[llamada] || secuenciaDeCoordenadas[0];
          llamada += 1;
          ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
        },
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('no pisa la referencia escrita mientras la geocodificacion sigue en curso', async () => {
    let resolverFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((input: any) => {
        const url = String(input);
        if (url.includes('/api/geocode/reverse')) {
          return new Promise<Response>((resolve) => {
            resolverFetch = resolve;
          });
        }
        return Promise.resolve(
          new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        );
      })
    );
    stubGeolocation([{ lat: -2.905, lng: -79.012 }]);

    montarPicker();
    fireEvent.click(screen.getByText(/Usar mi ubicación/i));

    // Mientras el fetch sigue pendiente, el cliente escribe su referencia.
    fireEvent.change(screen.getByLabelText(/Referencia de entrega/i), {
      target: { value: 'Casa verde, timbre 2' },
    });

    resolverFetch(
      new Response(JSON.stringify({ address: 'Avenida Solano 5-30' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await waitFor(() =>
      expect((screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value).toBe(
        'Avenida Solano 5-30'
      )
    );

    // El input de referencia solo refleja su propio estado local, que
    // completarDireccion nunca toca -- lo que hay que comprobar es el
    // estado real que se manda con el pedido (persistido en localStorage
    // por setDeliveryLocation), que si podia pisarse con una foto vieja.
    const guardado = JSON.parse(localStorage.getItem('el_taca_nijo_location') || '{}');
    expect(guardado.reference).toBe('Casa verde, timbre 2');
  });

  it('descarta una respuesta de geocodificacion vieja si el cliente ya movio el pin de nuevo', async () => {
    const resolvers: Array<(value: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: any) => {
        const url = String(input);
        if (url.includes('/api/geocode/reverse')) {
          return new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          });
        }
        return Promise.resolve(
          new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        );
      })
    );
    stubGeolocation([
      { lat: -2.905, lng: -79.012 },
      { lat: -2.885, lng: -79.032 },
    ]);

    montarPicker();

    fireEvent.click(screen.getByText(/Usar mi ubicación/i));
    await waitFor(() => expect(resolvers).toHaveLength(1));

    fireEvent.click(screen.getByText(/Usar mi ubicación/i));
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // La respuesta MAS NUEVA llega primero; la MAS VIEJA llega despues y
    // no deberia pisarla.
    resolvers[1](
      new Response(JSON.stringify({ address: 'Calle Nueva' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await waitFor(() =>
      expect((screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value).toBe(
        'Calle Nueva'
      )
    );

    resolvers[0](
      new Response(JSON.stringify({ address: 'Calle Vieja' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Le da tiempo a la promesa vieja de resolver y, si el bug esta
    // presente, de pisar la direccion.
    await new Promise((r) => setTimeout(r, 0));

    expect(
      (screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement).value
    ).toBe('Calle Nueva');
  });
});

/**
 * "no pisa la direccion que el cliente escribio a mano" (arriba) prueba que
 * el autocompletado respeta una direccion que sigue teniendo texto. Pero si
 * el campo llega a recibir CUALQUIER cambio -- una tecla que se borra al
 * toque, un intento fallido, lo que sea -- y queda vacio de nuevo, el
 * autocompletado se apagaba para siempre en esa sesion: mover el pin
 * despues ya no rellenaba nada, sin ningun aviso de por que.
 */
describe('LocationPicker, direccion que vuelve a quedar vacia', () => {
  function stubGeolocation(secuenciaDeCoordenadas: Array<{ lat: number; lng: number }>) {
    let llamada = 0;
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) => {
          const { lat, lng } = secuenciaDeCoordenadas[llamada] || secuenciaDeCoordenadas[0];
          llamada += 1;
          ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
        },
      },
    });
  }

  function stubFetch(address: string | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('/api/geocode/reverse')) {
          return new Response(JSON.stringify({ address }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('vuelve a autocompletar si el cliente borra lo que habia escrito', async () => {
    stubFetch('Avenida 10 de Agosto');
    stubGeolocation([{ lat: -2.908, lng: -79.026 }]);
    montarPicker();

    // El cliente escribe un caracter y se arrepiente, borra todo.
    const direccion = screen.getByLabelText(/Direcci[oó]n principal/i) as HTMLInputElement;
    fireEvent.change(direccion, { target: { value: 'x' } });
    fireEvent.change(direccion, { target: { value: '' } });

    fireEvent.click(screen.getByText(/Usar mi ubicación/i));

    await waitFor(() => expect(direccion.value).toBe('Avenida 10 de Agosto'));
  });
});
