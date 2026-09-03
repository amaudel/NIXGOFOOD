/**
 * El panel mostraba "Coordenadas: ," cuando una sucursal aun no tenia
 * ubicacion cargada (o mientras se resolvia). Un campo roto a la vista
 * del dueno del restaurante lee como software a medio terminar.
 */
import { describe, it, expect } from 'vitest';
import { formatCoordenadas } from '@/lib/formatCoordenadas';

describe('formatCoordenadas', () => {
  it('muestra las coordenadas cuando existen', () => {
    expect(formatCoordenadas(-2.90055, -79.00453)).toBe('-2.9005, -79.0045');
  });

  it('devuelve null si falta la latitud', () => {
    expect(formatCoordenadas(undefined, -79.00453)).toBeNull();
  });

  it('devuelve null si falta la longitud', () => {
    expect(formatCoordenadas(-2.90055, null)).toBeNull();
  });

  it('devuelve null si ambas faltan', () => {
    expect(formatCoordenadas(undefined, undefined)).toBeNull();
  });

  it('devuelve null ante valores no numericos', () => {
    expect(formatCoordenadas(NaN, -79.00453)).toBeNull();
    expect(formatCoordenadas('' as any, '' as any)).toBeNull();
  });

  it('acepta coordenadas en texto, como llegan de la base de datos', () => {
    expect(formatCoordenadas('-2.90055' as any, '-79.00453' as any)).toBe('-2.9005, -79.0045');
  });

  it('no descarta el cero, que es una coordenada valida', () => {
    expect(formatCoordenadas(0, 0)).toBe('0.0000, 0.0000');
  });
});
