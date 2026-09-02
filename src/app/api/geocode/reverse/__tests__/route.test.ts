import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/geocode/reverse/route';

function pedir(query: string) {
  return GET(new Request(`http://demo.localhost/api/geocode/reverse${query}`));
}

describe('GET /api/geocode/reverse', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            address: { road: 'Avenida Remigio Crespo Toral', house_number: '5-30' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve la calle formateada para un punto valido', async () => {
    const res = await pedir('?lat=-2.9050&lng=-79.0120');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      address: 'Avenida Remigio Crespo Toral 5-30',
    });
  });

  it('rechaza la peticion sin coordenadas en vez de geocodificar (0, 0)', async () => {
    const res = await pedir('');

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rechaza (0, 0), que es el valor inicial de la app y no una direccion', async () => {
    const res = await pedir('?lat=0&lng=0');

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rechaza coordenadas no numericas', async () => {
    const res = await pedir('?lat=abc&lng=-79.0120');

    expect(res.status).toBe(400);
  });

  it('rechaza coordenadas fuera de rango', async () => {
    const res = await pedir('?lat=999&lng=-79.0120');

    expect(res.status).toBe(400);
  });

  it('no inventa una direccion si el servicio falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));

    const res = await pedir('?lat=-2.9050&lng=-79.0120');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ address: null });
  });
});
