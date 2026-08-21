import { describe, it, expect } from 'vitest';
import { DeliveryZone } from '@/types';
import { DeliveryService, calculateDistanceKm } from '@/services/DeliveryService';

const zones: DeliveryZone[] = [
  { id: 'z1', businessId: 'b', branchId: 'br', name: 'Zona 1', maxDistanceKm: 2, fee: 1.5, estimatedMinutes: '20-30 min' },
  { id: 'z3', businessId: 'b', branchId: 'br', name: 'Zona 3', maxDistanceKm: 6, fee: 2.5, estimatedMinutes: '35-45 min' },
];

const params = (custLat: number) => ({
  branchLatitude: -2.90055,
  branchLongitude: -79.00453,
  customerLatitude: custLat,
  customerLongitude: -79.00453,
});

describe('calculateDistanceKm', () => {
  it('da 0 para el mismo punto', () => {
    expect(calculateDistanceKm(-2.9, -79.0, -2.9, -79.0)).toBe(0);
  });
});

describe('DeliveryService.calculateDeliveryFee', () => {
  it('cobra la zona mas pequena que cubre', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.89155), zones);
    expect(quote.available).toBe(true);
    expect(quote.fee).toBe(1.5);
    expect(quote.zoneId).toBe('z1');
  });

  it('usa una zona mayor cuando la chica no alcanza', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.87), zones);
    expect(quote.available).toBe(true);
    expect(quote.fee).toBe(2.5);
  });

  it('marca no disponible fuera de cobertura', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.80), zones);
    expect(quote.available).toBe(false);
    expect(quote.fee).toBe(0);
    expect(quote.reason).toBeTruthy();
  });

  it('marca no disponible si la sucursal no tiene zonas', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.89155), []);
    expect(quote.available).toBe(false);
  });
});
