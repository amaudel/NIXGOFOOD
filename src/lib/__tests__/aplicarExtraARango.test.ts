/**
 * Los tiempos de delivery ya vienen armados como texto desde las zonas
 * ("20-30 min"). Para sumarles la demora de cocina hay que abrirlos,
 * sumar y volver a armarlos, sin destrozar los que no tengan ese formato.
 */
import { describe, it, expect } from 'vitest';
import { aplicarExtraARango } from '@/lib/aplicarExtraARango';

describe('aplicarExtraARango', () => {
  it('suma a los dos extremos de un rango', () => {
    expect(aplicarExtraARango('20-30 min', 10)).toBe('30-40 min');
  });

  it('tolera los espacios alrededor del guion', () => {
    expect(aplicarExtraARango('15 - 25 min', 10)).toBe('25-35 min');
  });

  it('sin extra devuelve el texto tal cual', () => {
    expect(aplicarExtraARango('20-30 min', 0)).toBe('20-30 min');
  });

  it('suma a un tiempo de un solo numero', () => {
    expect(aplicarExtraARango('45 min', 10)).toBe('55 min');
  });

  it('deja intacto un texto sin numeros en vez de romperlo', () => {
    expect(aplicarExtraARango('Ahora', 10)).toBe('Ahora');
  });

  it('deja intacto un texto vacio', () => {
    expect(aplicarExtraARango('', 10)).toBe('');
  });

  it('no explota si el valor es nulo', () => {
    expect(aplicarExtraARango(null, 10)).toBe('');
  });

  it('ignora un extra negativo en vez de restar tiempo', () => {
    expect(aplicarExtraARango('20-30 min', -10)).toBe('20-30 min');
  });

  it('conserva la unidad cuando viene en horas y minutos', () => {
    // No se intenta interpretar formatos raros: si no matchea el patron
    // simple, se devuelve igual antes que mostrar algo incorrecto.
    expect(aplicarExtraARango('1 h 20 min', 10)).toBe('1 h 20 min');
  });
});
