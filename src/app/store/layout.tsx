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
