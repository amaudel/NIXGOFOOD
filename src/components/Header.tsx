'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingBag, UtensilsCrossed, ShieldCheck, MapPin, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { businessConfig } from '@/config/business';
import { getLastOrder, RecentOrder } from '@/utils/recentOrders';
import { OrderLookupModal } from '@/components/OrderLookupModal';

export const Header: React.FC = () => {
  const router = useRouter();
  const { cartTotalCount, cartSubtotal, setIsCartOpen, business, catalogLoading, storeStatus } =
    useApp();
  // El horario lo resuelve AppContext (misma fuente que usa el checkout para
  // bloquear el pedido). Antes el Header lo calculaba aparte, con su propio
  // fetch y sin businessId, asi que en multi-negocio podia mostrar el horario
  // de otro y contradecir al checkout.
  const isOpenStatus = storeStatus.isOpen;
  const [lastOrder, setLastOrder] = useState<RecentOrder | null>(null);
  const [isLookupModalOpen, setIsLookupModalOpen] = useState<boolean>(false);
  const [adminHref, setAdminHref] = useState('/admin');

  // "/admin" solo existe bajo el host admin.{rootDomain} -- en un subdominio
  // de tienda (ej. burger-house.food.tudominio.com) esa ruta relativa
  // apuntaba al mismo host y el middleware la bloqueaba con 404. El
  // storefront siempre vive en {slug}.{rootDomain}, asi que basta con
  // reemplazar el primer label del host actual por "admin".
  useEffect(() => {
    const host = window.location.host;
    const parts = host.split('.');
    if (parts.length > 1) {
      const rootDomain = parts.slice(1).join('.');
      setAdminHref(`${window.location.protocol}//admin.${rootDomain}/admin`);
    }
  }, []);

  useEffect(() => {
    setLastOrder(getLastOrder());
  }, []);

  const handleFollowOrderClick = () => {
    const currentLast = getLastOrder();
    if (currentLast && currentLast.trackingToken) {
      router.push(`/order/${currentLast.trackingToken}`);
    } else {
      setIsLookupModalOpen(true);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 text-white">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-4 h-16 flex items-center justify-between gap-2">
          {/* Brand Logo & Name */}
          <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-lg shadow-rose-950/40 group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <UtensilsCrossed className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-rose-500" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-base sm:text-lg leading-none tracking-tight text-zinc-100 group-hover:text-rose-400 transition-colors whitespace-nowrap">
                  {catalogLoading ? (
                    <span className="inline-block h-4 w-24 rounded bg-zinc-800 animate-pulse align-middle" />
                  ) : (
                    business?.name || businessConfig.name
                  )}
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-800 shrink-0">
                  {isOpenStatus ? '🟢 Abierto' : '🔴 Cerrado'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`sm:hidden text-[11px] font-bold ${isOpenStatus ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isOpenStatus ? '● Abierto' : '● Cerrado'}
                </span>
                {!catalogLoading && (
                  <span className="hidden sm:inline text-xs text-zinc-400 font-medium truncate">{business?.slogan || businessConfig.slogan}</span>
                )}
              </div>
            </div>
          </Link>

          {/* Right Actions: Search Order, Desktop Follow Order, Admin Link & Cart Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Search Order Modal Trigger */}
            <button
              onClick={() => setIsLookupModalOpen(true)}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-all flex items-center gap-1.5 text-xs font-bold min-h-[44px] min-w-[44px] justify-center"
              title="Buscar mi pedido"
              aria-label="Buscar mi pedido"
            >
              <Search className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden lg:inline text-zinc-300">Buscar pedido</span>
            </button>

            {/* Follow Order Button (Desktop & Tablet) */}
            <button
              onClick={handleFollowOrderClick}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 border border-zinc-700/70 text-amber-400 hover:text-amber-300 hover:border-amber-500/60 transition-all shadow-sm min-h-[44px]"
              title="Consultar estado de tu pedido"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {lastOrder ? `Seguir ${lastOrder.orderNumber}` : 'Seguir pedido'}
              </span>
            </button>

            {/* Admin Panel Link (Desktop) */}
            <Link
              href={adminHref}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700/60 text-zinc-300 hover:text-white hover:border-rose-500/50 transition-all min-h-[44px]"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              <span>Panel</span>
            </Link>

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white px-3.5 sm:px-4 py-2 rounded-xl font-medium shadow-lg shadow-rose-900/30 active:scale-95 transition-all min-h-[44px] min-w-[44px]"
              aria-label="Ver carrito"
            >
              <div className="relative">
                <ShoppingBag className="w-5 h-5" />
                {cartTotalCount > 0 && (
                  <span className="absolute -top-2.5 -right-2.5 bg-amber-500 text-zinc-950 font-black text-[11px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-950 animate-pulse">
                    {cartTotalCount > 10 ? '10+' : cartTotalCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline font-semibold text-sm">
                {cartTotalCount > 0 ? `$${cartSubtotal.toFixed(2)}` : 'Carrito'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Order Lookup Modal */}
      <OrderLookupModal
        isOpen={isLookupModalOpen}
        onClose={() => setIsLookupModalOpen(false)}
      />
    </>
  );
};
