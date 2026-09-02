import { describe, it, expect } from 'vitest';
import { formatReverseGeocodedAddress } from '@/lib/geocoding';

describe('formatReverseGeocodedAddress', () => {
  it('arma calle y numero como los lee un repartidor', () => {
    const direccion = formatReverseGeocodedAddress({
      address: {
        house_number: '5-30',
        road: 'Avenida Fray Vicente Solano',
        neighbourhood: 'El Ejido',
        city: 'Cuenca',
        country: 'Ecuador',
      },
    });

    expect(direccion).toBe('Avenida Fray Vicente Solano 5-30, El Ejido');
  });

  it('omite el numero cuando la esquina no lo tiene', () => {
    const direccion = formatReverseGeocodedAddress({
      address: {
        road: 'Avenida Ordóñez Lasso',
        suburb: 'Cazhapata',
        city: 'Cuenca',
      },
    });

    expect(direccion).toBe('Avenida Ordóñez Lasso, Cazhapata');
  });

  it('devuelve solo la calle cuando no hay barrio', () => {
    const direccion = formatReverseGeocodedAddress({
      address: { road: 'Calle Larga', city: 'Cuenca' },
    });

    expect(direccion).toBe('Calle Larga');
  });

  it('cae al display_name recortado cuando no viene la calle', () => {
    const direccion = formatReverseGeocodedAddress({
      display_name: 'Parque Calderón, Centro Histórico, Cuenca, Azuay, Ecuador',
      address: { city: 'Cuenca', country: 'Ecuador' },
    });

    expect(direccion).toBe('Parque Calderón, Centro Histórico');
  });

  it('devuelve null cuando no hay nada aprovechable', () => {
    expect(formatReverseGeocodedAddress({ address: { country: 'Ecuador' } })).toBeNull();
    expect(formatReverseGeocodedAddress({})).toBeNull();
    expect(formatReverseGeocodedAddress(null)).toBeNull();
  });

  it('no repite el barrio cuando coincide con la calle', () => {
    const direccion = formatReverseGeocodedAddress({
      address: { road: 'El Ejido', neighbourhood: 'El Ejido', city: 'Cuenca' },
    });

    expect(direccion).toBe('El Ejido');
  });
});
