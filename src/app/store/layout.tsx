import { AppProvider } from '@/context/AppContext';
import { BranchProvider } from '@/context/BranchContext';
import { Header } from '@/components/Header';
import { ActiveOrderBar } from '@/components/ActiveOrderBar';
import { CartDrawer } from '@/components/CartDrawer';
import { StickyCartBar } from '@/components/StickyCartBar';
import { ModalWrapper } from '@/components/ModalWrapper';
import { AddedToCartToast } from '@/components/AddedToCartToast';
import ChatWidget from '@/components/ChatWidget';
import { getResolvedBusinessId } from '@/lib/tenant';
import { buildStoreMetadata } from '@/lib/storeMetadata';
import { createClient } from '@/lib/supabase/server';
import { businessConfig } from '@/config/business';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

/**
 * Identidad publica de ESTA tienda (una por tenant). Sin esto el
 * storefront de cada negocio heredaba el titulo generico de la
 * plataforma, asi que al compartir el enlace por WhatsApp aparecia la
 * marca del proveedor en lugar de la del restaurante.
 */
export async function generateMetadata(): Promise<Metadata> {
  const businessId = await getResolvedBusinessId();

  let identidad = {
    name: businessConfig.name,
    slogan: businessConfig.slogan,
    description: businessConfig.description,
    logoUrl: businessConfig.logo,
    coverImageUrl: businessConfig.coverImage,
  };

  if (businessId) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .maybeSingle();

      if (data?.name) {
        identidad = {
          name: data.name,
          slogan: data.slogan || '',
          description: data.description || '',
          logoUrl: data.logo_url || '',
          coverImageUrl: data.cover_image_url || '',
        };
      }
    } catch {
      // Sin datos del negocio se usa el fallback de arriba: un titulo
      // imperfecto es mejor que romper el render de la tienda entera.
    }
  }

  const metadata = buildStoreMetadata(identidad);

  // Las imagenes del negocio pueden ser rutas relativas (/demo/...). Las
  // tarjetas de WhatsApp y redes solo aceptan URLs absolutas, y
  // metadataBase es lo que Next usa para resolverlas.
  const host = (await headers()).get('host');
  if (host) {
    const protocolo = host.startsWith('localhost') || host.includes('.localhost') ? 'http' : 'https';
    metadata.metadataBase = new URL(`${protocolo}://${host}`);
  }

  return metadata;
}

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const businessId = await getResolvedBusinessId();
  if (!businessId) {
    // El middleware garantiza que solo se llega aca con un business_id
    // resuelto (slugs invalidos se reescriben a /negocio-no-encontrado antes).
    throw new Error('TENANT_NOT_RESOLVED: /store renderizado sin x-business-id.');
  }

  return (
    <BranchProvider scope="customer" businessId={businessId}>
      <AppProvider businessId={businessId}>
        <Header />
        <ActiveOrderBar />
        <main className="flex-1 pb-20 sm:pb-8">{children}</main>
        <CartDrawer />
        <StickyCartBar />
        <AddedToCartToast />
        <ModalWrapper />
        <ChatWidget />
      </AppProvider>
    </BranchProvider>
  );
}
