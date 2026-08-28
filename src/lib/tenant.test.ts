import { describe, it, expect } from 'vitest';
import { classifyHost } from './tenant';

describe('classifyHost', () => {
  const root = 'tuapp.com';

  it('clasifica el dominio raiz', () => {
    expect(classifyHost('tuapp.com', root)).toEqual({ kind: 'root' });
  });

  it('clasifica www como raiz', () => {
    expect(classifyHost('www.tuapp.com', root)).toEqual({ kind: 'root' });
  });

  it('clasifica el subdominio admin', () => {
    expect(classifyHost('admin.tuapp.com', root)).toEqual({ kind: 'admin' });
  });

  it('clasifica un subdominio de negocio y extrae el slug', () => {
    expect(classifyHost('tacos-el-nijo.tuapp.com', root)).toEqual({
      kind: 'store',
      slug: 'tacos-el-nijo',
    });
  });

  it('ignora el puerto al comparar (dev local)', () => {
    expect(classifyHost('admin.localhost:3000', 'localhost:3000')).toEqual({ kind: 'admin' });
    expect(classifyHost('tacos.localhost:3000', 'localhost:3000')).toEqual({
      kind: 'store',
      slug: 'tacos',
    });
  });

  it('clasifica un host que no matchea ni raiz ni subdominio propio como unknown', () => {
    expect(classifyHost('otrositio.com', root)).toEqual({ kind: 'unknown' });
  });

  it('un subdominio con mas de un nivel no matchea (evita falsos positivos)', () => {
    expect(classifyHost('a.b.tuapp.com', root)).toEqual({ kind: 'unknown' });
  });
});
