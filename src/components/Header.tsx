'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, UtensilsCrossed, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { businessConfig } from '@/config/business';
import { BusinessHoursService } from '@/services/BusinessHoursService';
import { isDemoMode } from '@/config/demo';
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';

export const Header: React.FC = () => {
  const { cartTotalCount, cartSubtotal, setIsCartOpen } = useApp();
  const [isOpenStatus, setIsOpenStatus] = useState<boolean>(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        if (isDemoMode()) {
          const hours = await DemoBusinessRepository.getBusinessHours();
          const biz = await DemoBusinessRepository.getBusiness();
          const status = BusinessHoursService.isRestaurantOpen(hours, biz?.timezone || 'America/Guayaquil');
          setIsOpenStatus(status.isOpen);
        }
      } catch (e) {
        console.error(e);
      }
    }
    checkStatus();
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 text-white">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-lg shadow-rose-950/40 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-rose-500" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg leading-none tracking-tight text-zinc-100 group-hover:text-rose-400 transition-colors">
                {businessConfig.name}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-800">
                {isOpenStatus ? '🟢 Abierto' : '🔴 Cerrado'}
              </span>
            </div>
            <span className="text-xs text-zinc-400 font-medium">{businessConfig.slogan}</span>
          </div>
        </Link>

        {/* Right Actions: Admin Link & Cart Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700/60 text-zinc-300 hover:text-white hover:border-rose-500/50 transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Panel Restaurante</span>
          </Link>

          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white px-4 py-2 rounded-xl font-medium shadow-lg shadow-rose-900/30 active:scale-95 transition-all"
            aria-label="Ver carrito"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {cartTotalCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-amber-500 text-zinc-950 font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                  {cartTotalCount}
                </span>
              )}
            </div>
            <span className="hidden xs:inline font-semibold text-sm">
              {cartTotalCount > 0 ? `$${cartSubtotal.toFixed(2)}` : 'Carrito'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
