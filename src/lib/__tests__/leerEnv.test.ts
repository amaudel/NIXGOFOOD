/**
 * Una variable de entorno cargada desde el panel de Vercel puede traer
 * espacios invisibles al inicio o al final. Con KV_REST_API_URL eso
 * producia URLs como "https://host.upstash.io /incr/..." y tumbaba el
 * rate limiter distribuido en cada request.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { leerEnv } from '@/lib/leerEnv';

const ORIGINALES = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINALES };
});

describe('leerEnv', () => {
  it('recorta los espacios que deja el panel de Vercel al pegar un valor', () => {
    process.env.PRUEBA_URL = '  https://host.upstash.io  ';

    expect(leerEnv('PRUEBA_URL')).toBe('https://host.upstash.io');
  });

  it('devuelve el valor tal cual cuando esta limpio', () => {
    process.env.PRUEBA_URL = 'https://host.upstash.io';

    expect(leerEnv('PRUEBA_URL')).toBe('https://host.upstash.io');
  });

  it('trata como ausente una variable que solo tiene espacios', () => {
    process.env.PRUEBA_URL = '   ';

    expect(leerEnv('PRUEBA_URL')).toBeUndefined();
  });

  it('devuelve undefined si la variable no existe', () => {
    delete process.env.PRUEBA_URL;

    expect(leerEnv('PRUEBA_URL')).toBeUndefined();
  });

  it('usa el primer nombre que tenga valor, respetando la prioridad', () => {
    process.env.PRIMERA = 'https://primera';
    process.env.SEGUNDA = 'https://segunda';

    expect(leerEnv('PRIMERA', 'SEGUNDA')).toBe('https://primera');
  });

  it('cae al nombre alternativo cuando el primero esta vacio', () => {
    process.env.PRIMERA = '  ';
    process.env.SEGUNDA = '  https://segunda ';

    expect(leerEnv('PRIMERA', 'SEGUNDA')).toBe('https://segunda');
  });

  it('devuelve undefined si ninguno de los nombres tiene valor', () => {
    delete process.env.PRIMERA;
    delete process.env.SEGUNDA;

    expect(leerEnv('PRIMERA', 'SEGUNDA')).toBeUndefined();
  });
});
