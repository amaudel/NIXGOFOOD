import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import { BranchProvider } from '@/context/BranchContext';
import { Header } from '@/components/Header';
import { ActiveOrderBar } from '@/components/ActiveOrderBar';
import { CartDrawer } from '@/components/CartDrawer';
import { StickyCartBar } from '@/components/StickyCartBar';
import { ModalWrapper } from '@/components/ModalWrapper';
import ChatWidget from '@/components/ChatWidget';

export const metadata: Metadata = {
  title: 'El Taca Nijo - Pedidos Directos',
  description: 'Sabor que provoca volver. Tacos, hamburguesas, combos y entradas a domicilio o retiro.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased">
        <BranchProvider scope="customer">
          <AppProvider>
            <Header />
            <ActiveOrderBar />
            <main className="flex-1 pb-20 sm:pb-8">{children}</main>
            <CartDrawer />
            <StickyCartBar />
            <ModalWrapper />
            <ChatWidget />
          </AppProvider>
        </BranchProvider>
      </body>
    </html>
  );
}
