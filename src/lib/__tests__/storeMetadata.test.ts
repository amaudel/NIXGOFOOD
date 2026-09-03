/**
 * El storefront se comparte por WhatsApp e Instagram. Antes toda tienda
 * -- demo y clientes reales -- se anunciaba como "NIXGOFOOD", asi que el
 * enlace del restaurante parecia el de una app de terceros en vez del
 * canal propio del negocio. Estas reglas arman esa identidad por tenant.
 */
import { describe, it, expect } from 'vitest';
import { buildStoreMetadata } from '@/lib/storeMetadata';

describe('buildStoreMetadata', () => {
  it('titula con el nombre del negocio, no con la marca de la plataforma', () => {
    const meta = buildStoreMetadata({ name: 'El Taca Nijo' });

    expect(meta.title).toBe('El Taca Nijo | Pedidos Online');
    expect(JSON.stringify(meta)).not.toMatch(/NIXGOFOOD/i);
  });

  it('usa la descripcion del negocio cuando existe', () => {
    const meta = buildStoreMetadata({
      name: 'Burger House',
      slogan: 'La mejor hamburguesa',
      description: 'Smash burgers artesanales con pan brioche horneado a diario.',
    });

    expect(meta.description).toBe('Smash burgers artesanales con pan brioche horneado a diario.');
  });

  it('cae al slogan cuando el negocio no cargo descripcion', () => {
    const meta = buildStoreMetadata({ name: 'Burger House', slogan: 'La mejor hamburguesa' });

    expect(meta.description).toContain('La mejor hamburguesa');
  });

  it('sin descripcion ni slogan igual dice como pedir, sin quedar vacio', () => {
    const meta = buildStoreMetadata({ name: 'Burger House' });

    expect(meta.description).toBeTruthy();
    expect(meta.description).toContain('Burger House');
  });

  it('comparte la portada del negocio como imagen de Open Graph', () => {
    const meta = buildStoreMetadata({
      name: 'El Taca Nijo',
      coverImageUrl: 'https://cdn.ejemplo.com/portada.webp',
      logoUrl: 'https://cdn.ejemplo.com/logo.png',
    });

    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.ejemplo.com/portada.webp' }]);
  });

  it('usa el logo como imagen social si no hay portada', () => {
    const meta = buildStoreMetadata({
      name: 'El Taca Nijo',
      logoUrl: 'https://cdn.ejemplo.com/logo.png',
    });

    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.ejemplo.com/logo.png' }]);
  });

  it('usa el logo del negocio como favicon', () => {
    const meta = buildStoreMetadata({
      name: 'El Taca Nijo',
      logoUrl: 'https://cdn.ejemplo.com/logo.png',
    });

    expect(meta.icons).toEqual({ icon: 'https://cdn.ejemplo.com/logo.png' });
  });

  it('omite icons cuando el negocio no tiene logo, en vez de dejar un icono roto', () => {
    const meta = buildStoreMetadata({ name: 'El Taca Nijo' });

    expect(meta.icons).toBeUndefined();
  });

  it('nombra al negocio como siteName para que WhatsApp muestre su marca', () => {
    const meta = buildStoreMetadata({ name: 'El Taca Nijo' });

    expect(meta.openGraph?.siteName).toBe('El Taca Nijo');
    expect(meta.openGraph?.title).toBe('El Taca Nijo | Pedidos Online');
  });
});
