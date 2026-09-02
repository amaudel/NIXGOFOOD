import { describe, it, expect } from 'vitest';
import { resolveMapCenter, shouldShowCustomerPin } from '@/lib/mapView';

const sucursal = { latitude: -2.90055, longitude: -79.00453 };
const domicilio = { latitude: -2.905, longitude: -79.012 };

describe('resolveMapCenter', () => {
  it('centra en la sucursal cuando el cliente todavia no eligio un punto', () => {
    const centro = resolveMapCenter({ latitude: 0, longitude: 0 }, sucursal, false);

    expect(centro).toEqual(sucursal);
  });

  it('centra en el domicilio una vez que el cliente eligio su punto', () => {
    const centro = resolveMapCenter(domicilio, sucursal, true);

    expect(centro).toEqual(domicilio);
  });

  it('cae a la sucursal si el punto marcado como elegido es (0, 0)', () => {
    const centro = resolveMapCenter({ latitude: 0, longitude: 0 }, sucursal, true);

    expect(centro).toEqual(sucursal);
  });

  it('cae a la sucursal si las coordenadas del cliente no son numeros validos', () => {
    const centro = resolveMapCenter({ latitude: NaN, longitude: -79.012 }, sucursal, true);

    expect(centro).toEqual(sucursal);
  });
});

describe('shouldShowCustomerPin', () => {
  it('no dibuja el pin del cliente antes de que elija su punto', () => {
    expect(shouldShowCustomerPin({ latitude: 0, longitude: 0 }, false)).toBe(false);
  });

  it('dibuja el pin una vez que el cliente eligio su punto', () => {
    expect(shouldShowCustomerPin(domicilio, true)).toBe(true);
  });

  it('no dibuja un pin en (0, 0) aunque la ubicacion figure como elegida', () => {
    expect(shouldShowCustomerPin({ latitude: 0, longitude: 0 }, true)).toBe(false);
  });
});
