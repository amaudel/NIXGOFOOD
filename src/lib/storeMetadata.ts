import type { Metadata } from 'next';

export interface StoreIdentity {
  name: string;
  slogan?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
}

/**
 * Arma la identidad publica del storefront de UN negocio.
 *
 * El enlace de la tienda se comparte por WhatsApp e Instagram: lo que
 * aparezca en el titulo, la descripcion y la imagen social es lo que el
 * cliente final asocia con el restaurante. Antes todas las tiendas
 * heredaban el titulo generico de la plataforma, asi que el enlace del
 * negocio se anunciaba con la marca del proveedor en vez de la propia.
 */
export function buildStoreMetadata(identity: StoreIdentity): Metadata {
  const titulo = `${identity.name} | Pedidos Online`;

  const descripcion =
    identity.description?.trim() ||
    identity.slogan?.trim() ||
    `Pide en línea a ${identity.name}. Delivery y retiro en local.`;

  // La portada representa mejor al negocio que el logo en la tarjeta de
  // WhatsApp (ocupa todo el ancho), pero el logo sirve de respaldo.
  const imagenSocial = identity.coverImageUrl || identity.logoUrl;

  return {
    title: titulo,
    description: descripcion,
    // Sin logo no se declara icons: un href vacio deja el favicon roto,
    // peor que dejar que el navegador use su icono por defecto.
    ...(identity.logoUrl ? { icons: { icon: identity.logoUrl } } : {}),
    openGraph: {
      type: 'website',
      siteName: identity.name,
      title: titulo,
      description: descripcion,
      ...(imagenSocial ? { images: [{ url: imagenSocial }] } : {}),
    },
    twitter: {
      card: imagenSocial ? 'summary_large_image' : 'summary',
      title: titulo,
      description: descripcion,
      ...(imagenSocial ? { images: [imagenSocial] } : {}),
    },
  };
}
