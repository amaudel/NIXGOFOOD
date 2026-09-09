/**
 * isDemoMode() es la unica fuente de verdad para "estamos en modo demo" --
 * la usan adminAuth.ts (bypass de auth) y middleware.ts (resolucion de
 * tenant). Esta bateria protege especificamente el guard "fail closed": en
 * produccion, una config ausente o mal escrita NUNCA debe activar Demo Mode
 * solo -- y un override explicito siempre debe ganar, en cualquier entorno.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDemoMode } from '@/config/demo';

const ORIGINALES = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINALES };
  vi.unstubAllEnvs();
});

describe('isDemoMode', () => {
  it('NEXT_PUBLIC_DEMO_MODE=true explicito gana en produccion, aunque Supabase este configurado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://real-project.supabase.co';

    expect(isDemoMode()).toBe(true);
  });

  it('NEXT_PUBLIC_DEMO_MODE=false explicito gana en produccion, aunque Supabase no este configurado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isDemoMode()).toBe(false);
  });

  it('NEXT_PUBLIC_DEMO_MODE=false explicito gana fuera de produccion tambien', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isDemoMode()).toBe(false);
  });

  it('en produccion, Supabase ausente sin override explicito NO activa demo mode (fail closed)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isDemoMode()).toBe(false);
  });

  it('en produccion, Supabase con URL placeholder sin override explicito NO activa demo mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';

    expect(isDemoMode()).toBe(false);
  });

  it('en produccion, un NEXT_PUBLIC_DEMO_MODE mal escrito se trata como ausente (fail closed)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_DEMO_MODE = 'yes'; // valor invalido, ni true/false/1/0
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isDemoMode()).toBe(false);
  });

  it('en produccion, Supabase configurado con una URL real NO activa demo mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://real-project.supabase.co';

    expect(isDemoMode()).toBe(false);
  });

  it('fuera de produccion, Supabase ausente sin override explicito SI activa demo mode (dev out-of-the-box)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isDemoMode()).toBe(true);
  });

  it('fuera de produccion, Supabase con URL placeholder SI activa demo mode', () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://your-project.supabase.co';

    expect(isDemoMode()).toBe(true);
  });
});
