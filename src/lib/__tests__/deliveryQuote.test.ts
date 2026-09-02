import { describe, it, expect } from 'vitest';
import { resolveDeliveryQuote } from '@/lib/deliveryQuote';
import { Branch, DeliveryZone } from '@/types';

// Dos sucursales separadas 1 grado (~111 km) para que las distancias sean
// faciles de razonar sin depender de aritmetica de Haversine de cabeza.
const cercana: Branch = {
  id: 'b_cercana',
  businessId: 'biz',
  name: 'Sucursal Cercana',
  address: 'x',
  latitude: 0,
  longitude: 0,
  phone: '',
  active: true,
};

// A 0.15 grados (~16.6 km) de "cercana": lo bastante cerca para que sus
// zonas de 20 km se superpongan con un punto intermedio, pero lo bastante
// lejos para que un punto pegado a "cercana" quede fuera del alcance de
// "lejana".
const lejana: Branch = {
  id: 'b_lejana',
  businessId: 'biz',
  name: 'Sucursal Lejana',
  address: 'x',
  latitude: 0.15,
  longitude: 0,
  phone: '',
  active: true,
};

const branches: Branch[] = [cercana, lejana];

const zonas: DeliveryZone[] = [
  {
    id: 'z_cercana',
    businessId: 'biz',
    branchId: 'b_cercana',
    name: 'Zona cercana',
    maxDistanceKm: 20,
    fee: 1,
    estimatedMinutes: '15-20 min',
    active: true,
  },
  {
    id: 'z_lejana',
    businessId: 'biz',
    branchId: 'b_lejana',
    name: 'Zona lejana',
    maxDistanceKm: 20,
    fee: 2,
    estimatedMinutes: '20-30 min',
    active: true,
  },
];

// A ~5.5 km de "cercana" y ~11.1 km de "lejana": dentro de las dos zonas
// (20 km), con "cercana" mas cerca.
const puntoCubiertoPorAmbas = { lat: 0.05, lng: 0 };

// A ~16.6 km de "cercana" (cubierto) y ~23.6 km de "lejana" (fuera de su
// radio de 20 km).
const puntoSoloCercanaCubre = { lat: 0, lng: 0.15 };

// A cientos de km de ambas sucursales: ninguna cubre este punto.
const puntoSinCobertura = { lat: 4, lng: 4 };

describe('resolveDeliveryQuote', () => {
  it('sin eleccion manual, cotiza contra la sucursal mas cercana que cubre el punto', () => {
    const resultado = resolveDeliveryQuote({
      ...puntoCubiertoPorAmbas,
      branches,
      zones: zonas,
      manuallySelectedBranch: null,
    });

    expect(resultado.branch?.id).toBe('b_cercana');
    expect(resultado.quote.available).toBe(true);
  });

  it('respeta la sucursal elegida a mano mientras siga cubriendo el punto', () => {
    // "lejana" cubre el punto igual (20 km de radio), aunque no sea la mas
    // cercana -- es justo la eleccion deliberada que no debe revertirse.
    const resultado = resolveDeliveryQuote({
      ...puntoCubiertoPorAmbas,
      branches,
      zones: zonas,
      manuallySelectedBranch: lejana,
    });

    expect(resultado.branch?.id).toBe('b_lejana');
    expect(resultado.quote.available).toBe(true);
  });

  it('cae a la sucursal mas cercana si la elegida a mano ya no cubre el punto', () => {
    const resultado = resolveDeliveryQuote({
      ...puntoSoloCercanaCubre,
      branches,
      zones: zonas,
      manuallySelectedBranch: lejana,
    });

    expect(resultado.branch?.id).toBe('b_cercana');
    expect(resultado.quote.available).toBe(true);
  });

  it('devuelve sin disponibilidad cuando ninguna sucursal cubre el punto, incluso con eleccion manual', () => {
    const resultado = resolveDeliveryQuote({
      ...puntoSinCobertura,
      branches,
      zones: zonas,
      manuallySelectedBranch: lejana,
    });

    expect(resultado.branch).toBeNull();
    expect(resultado.quote.available).toBe(false);
  });
});
