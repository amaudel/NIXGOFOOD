/**
 * Cache chico en memoria para no consultar la carga de la cocina en cada
 * visita al menu.
 *
 * No se usa `use cache` de Next 16 porque exige activar cacheComponents
 * en next.config, lo que cambia la semantica de cache de TODA la app --
 * demasiado para un solo endpoint. unstable_cache quedo deprecado en
 * esta version. Que cada instancia tenga su copia es aceptable: lo
 * cacheado es un numero de minutos con TTL de segundos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { crearCacheTTL } from '@/lib/cacheTTL';

describe('crearCacheTTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula una sola vez dentro de la ventana', async () => {
    const calcular = vi.fn(async () => 42);
    const cache = crearCacheTTL(calcular, 30_000);

    expect(await cache('sucursal-1')).toBe(42);
    expect(await cache('sucursal-1')).toBe(42);

    expect(calcular).toHaveBeenCalledTimes(1);
  });

  it('vuelve a calcular cuando vence el TTL', async () => {
    let valor = 1;
    const calcular = vi.fn(async () => valor);
    const cache = crearCacheTTL(calcular, 30_000);

    expect(await cache('sucursal-1')).toBe(1);

    valor = 2;
    vi.advanceTimersByTime(31_000);

    expect(await cache('sucursal-1')).toBe(2);
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it('no mezcla sucursales distintas', async () => {
    const calcular = vi.fn(async (clave: string) => (clave === 'a' ? 10 : 20));
    const cache = crearCacheTTL(calcular, 30_000);

    expect(await cache('a')).toBe(10);
    expect(await cache('b')).toBe(20);
  });

  it('no cachea un fallo: el proximo intento vuelve a consultar', async () => {
    const calcular = vi
      .fn()
      .mockRejectedValueOnce(new Error('base caida'))
      .mockResolvedValueOnce(7);
    const cache = crearCacheTTL(calcular, 30_000);

    await expect(cache('sucursal-1')).rejects.toThrow('base caida');
    expect(await cache('sucursal-1')).toBe(7);
  });

  it('comparte una consulta en curso en vez de disparar varias iguales', async () => {
    let resolver: (v: number) => void = () => {};
    const calcular = vi.fn(() => new Promise<number>((r) => { resolver = r; }));
    const cache = crearCacheTTL(calcular, 30_000);

    const a = cache('sucursal-1');
    const b = cache('sucursal-1');
    resolver(5);

    expect(await a).toBe(5);
    expect(await b).toBe(5);
    expect(calcular).toHaveBeenCalledTimes(1);
  });
});
