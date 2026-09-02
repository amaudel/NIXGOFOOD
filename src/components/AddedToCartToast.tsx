'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const TIEMPO_VISIBLE_MS = 2800;

/**
 * Reemplaza el auto-abrir el panel del carrito en cada "Agregar". Confirma
 * que el producto entro sin tapar el menu, y ofrece un atajo directo al
 * carrito para quien ya termino de pedir.
 */
export const AddedToCartToast: React.FC = () => {
  const { cartNotice, dismissCartNotice, setIsCartOpen } = useApp();

  useEffect(() => {
    if (!cartNotice) return;
    const timer = setTimeout(dismissCartNotice, TIEMPO_VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartNotice]);

  if (!cartNotice) return null;

  const handleVerCarrito = () => {
    setIsCartOpen(true);
    dismissCartNotice();
  };

  return (
    <div
      role="status"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm animate-fadeIn"
    >
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-3 pl-4">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0 text-xs">
          <p className="font-bold text-white truncate">
            {cartNotice.quantity > 1 ? `${cartNotice.quantity}× ` : ''}
            {cartNotice.productName}
          </p>
          <p className="text-zinc-400">Agregado a tu pedido</p>
        </div>
        <button
          type="button"
          onClick={handleVerCarrito}
          className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-700 shrink-0 min-h-[36px]"
        >
          <span>Ver carrito</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
