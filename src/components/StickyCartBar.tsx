'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export const StickyCartBar: React.FC = () => {
  const { cartTotalCount, cartSubtotal, setIsCartOpen, isCartOpen } = useApp();

  if (cartTotalCount === 0 || isCartOpen) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-30 sm:hidden animate-slideUp">
      <button
        onClick={() => setIsCartOpen(true)}
        className="w-full flex items-center justify-between bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-5 py-3.5 rounded-2xl shadow-2xl shadow-rose-950/80 border border-rose-400/30 active:scale-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="bg-zinc-950/50 p-2 rounded-xl backdrop-blur-md">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-xs text-rose-100 font-medium">Ver tu pedido</p>
            <p className="text-sm font-bold">{cartTotalCount} {cartTotalCount === 1 ? 'producto' : 'productos'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-base font-black text-amber-300">${cartSubtotal.toFixed(2)}</span>
          <ArrowRight className="w-5 h-5" />
        </div>
      </button>
    </div>
  );
};
