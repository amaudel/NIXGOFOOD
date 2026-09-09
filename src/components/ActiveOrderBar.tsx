'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock, ChefHat, Store, Bike } from 'lucide-react';
import { getLastOrder, RecentOrder } from '@/utils/recentOrders';
import { getOrderRepository } from '@/repositories/factory';
import { useApp } from '@/context/AppContext';

interface ActiveOrderInfo extends RecentOrder {
  status: string;
  deliveryMethod?: string;
}

export const ActiveOrderBar: React.FC = () => {
  const router = useRouter();
  const { isDemo } = useApp();
  const [activeOrder, setActiveOrder] = useState<ActiveOrderInfo | null>(null);

  useEffect(() => {
    async function checkActiveOrder() {
      const last = getLastOrder();
      if (!last || !last.trackingToken) {
        setActiveOrder(null);
        return;
      }

      try {
        let status = 'new';
        let deliveryMethod = 'delivery';

        if (isDemo) {
          const repo = getOrderRepository();
          const demoOrd = await repo.getOrderByTrackingToken(last.trackingToken);
          if (demoOrd) {
            status = demoOrd.status;
            deliveryMethod = demoOrd.deliveryMethod || 'delivery';
          }
        } else {
          const res = await fetch(`/api/orders/${last.trackingToken}`);
          if (res.ok) {
            const data = await res.json();
            status = data.status;
            deliveryMethod = data.deliveryMethod || 'delivery';
          }
        }

        // Hide for terminal statuses: delivered or cancelled
        if (status === 'delivered' || status === 'cancelled') {
          setActiveOrder(null);
          return;
        }

        setActiveOrder({
          ...last,
          status,
          deliveryMethod,
        });
      } catch (err) {
        console.error('ActiveOrderBar check error:', err);
      }
    }

    checkActiveOrder();
    const interval = setInterval(checkActiveOrder, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!activeOrder) return null;

  const getStatusBadge = (status: string, deliveryMethod?: string) => {
    switch (status) {
      case 'new':
        return {
          label: 'Pedido recibido',
          icon: Clock,
          colorClass: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
          dotColor: 'bg-amber-400 animate-pulse',
        };
      case 'preparing':
        return {
          label: 'En preparación',
          icon: ChefHat,
          colorClass: 'text-orange-400 bg-orange-950/60 border-orange-800/80',
          dotColor: 'bg-orange-400 animate-pulse',
        };
      case 'ready':
        return {
          label: deliveryMethod === 'pickup' ? 'Listo para retirar' : 'Listo',
          icon: Store,
          colorClass: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
          dotColor: 'bg-emerald-400 animate-pulse',
        };
      case 'on_the_way':
        return {
          label: 'En camino',
          icon: Bike,
          colorClass: 'text-sky-400 bg-sky-950/60 border-sky-800/80',
          dotColor: 'bg-sky-400 animate-bounce',
        };
      default:
        return {
          label: 'En proceso',
          icon: Clock,
          colorClass: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
          dotColor: 'bg-amber-400 animate-pulse',
        };
    }
  };

  const badge = getStatusBadge(activeOrder.status, activeOrder.deliveryMethod);
  const IconComponent = badge.icon;

  return (
    <div className="w-full bg-zinc-900/95 border-b border-zinc-800 backdrop-blur-md">
      <button
        onClick={() => router.push(`/order/${activeOrder.trackingToken}`)}
        className="w-full max-w-6xl mx-auto px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-all hover:bg-zinc-850 active:bg-zinc-800 group focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        aria-label={`Ver estado del pedido ${activeOrder.orderNumber}: ${badge.label}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`p-1.5 rounded-lg border shrink-0 ${badge.colorClass}`}>
            <IconComponent className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-black text-zinc-100 whitespace-nowrap shrink-0">
              Pedido {activeOrder.orderNumber}
            </span>
            <span className="text-zinc-500 font-bold text-xs shrink-0">·</span>
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dotColor}`} />
              <span className="text-xs font-bold text-amber-300 truncate">
                {badge.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs font-bold text-amber-400 shrink-0 group-hover:translate-x-0.5 transition-transform">
          <span className="hidden sm:inline">Ver estado</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
};
