/**
 * Avisos sobre la tabla de escalones que el restaurante esta editando.
 * El calculo tolera huecos (usa el escalon inferior mas cercano), pero
 * un hueco casi siempre es un error de carga, y conviene avisarlo antes
 * de que el cliente vea un tiempo que nadie quiso configurar.
 */
import { describe, it, expect } from 'vitest';
import { validarEscalones } from '@/lib/validarEscalones';

describe('validarEscalones', () => {
  it('una tabla bien armada no genera avisos', () => {
    expect(
      validarEscalones([
        { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
        { desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
        { desdeItems: 26, hastaItems: null, minutosExtra: 20 },
      ])
    ).toEqual([]);
  });

  it('una tabla vacia no genera avisos: la funcion es opt-in', () => {
    expect(validarEscalones([])).toEqual([]);
  });

  it('detecta un hueco entre tramos', () => {
    const avisos = validarEscalones([
      { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
      { desdeItems: 20, hastaItems: null, minutosExtra: 15 },
    ]);

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/11.*19/);
  });

  it('detecta tramos que se pisan', () => {
    const avisos = validarEscalones([
      { desdeItems: 0, hastaItems: 15, minutosExtra: 0 },
      { desdeItems: 10, hastaItems: null, minutosExtra: 15 },
    ]);

    expect(avisos.some((a) => /pisan|solapan/i.test(a))).toBe(true);
  });

  it('avisa cuando el rango de un tramo esta invertido', () => {
    const avisos = validarEscalones([{ desdeItems: 20, hastaItems: 5, minutosExtra: 10 }]);

    expect(avisos.some((a) => /mayor|invertido/i.test(a))).toBe(true);
  });

  it('avisa si hay mas de un tramo sin tope', () => {
    const avisos = validarEscalones([
      { desdeItems: 0, hastaItems: null, minutosExtra: 5 },
      { desdeItems: 10, hastaItems: null, minutosExtra: 15 },
    ]);

    expect(avisos.some((a) => /sin tope/i.test(a))).toBe(true);
  });

  it('avisa si el ultimo tramo tiene tope: una carga mayor quedaria sin cubrir', () => {
    const avisos = validarEscalones([
      { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
      { desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
    ]);

    expect(avisos.some((a) => /26/.test(a))).toBe(true);
  });

  it('no se marea con los tramos desordenados', () => {
    expect(
      validarEscalones([
        { desdeItems: 26, hastaItems: null, minutosExtra: 20 },
        { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
        { desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
      ])
    ).toEqual([]);
  });

  it('avisa si algun valor es negativo', () => {
    const avisos = validarEscalones([
      { desdeItems: -5, hastaItems: null, minutosExtra: 10 },
    ]);

    expect(avisos.some((a) => /negativ/i.test(a))).toBe(true);
  });
});
