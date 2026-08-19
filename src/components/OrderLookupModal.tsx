'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, PackageCheck, AlertCircle, ArrowRight, Clock } from 'lucide-react';
import { getRecentOrders, RecentOrder } from '@/utils/recentOrders';

interface OrderLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrderLookupModal: React.FC<OrderLookupModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRecentOrders(getRecentOrders());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!orderNumber.trim() || !phone.trim()) {
      setError('Ingresa el número de pedido y el teléfono.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), phone: phone.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.trackingToken) {
        throw new Error(data.error || 'No encontramos un pedido con esos datos.');
      }

      onClose();
      router.push(`/order/${data.trackingToken}`);
    } catch (err: any) {
      setError(err.message || 'No encontramos un pedido con esos datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRecent = (token: string) => {
    onClose();
    router.push(`/order/${token}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-zinc-100 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2 rounded-full border border-zinc-800 hover:border-zinc-700 bg-zinc-950 transition-all"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-amber-400 shadow-inner">
            <Search className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-white">Buscar mi pedido</h2>
          <p className="text-xs text-zinc-400">
            Ingresa los datos con los que realizaste tu compra para consultar el estado en vivo.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLookup} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Número de Pedido
            </label>
            <input
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Ej: 1054 o #1054"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Teléfono Registrado
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 0991234567"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-rose-950/70 border border-rose-800/80 p-3 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition-all text-sm disabled:opacity-50 active:scale-95"
          >
            <span>{loading ? 'Buscando pedido...' : 'Buscar Pedido'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Recent Orders List if available */}
        {recentOrders.length > 0 && (
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Tus pedidos recientes</span>
            </div>
            <div className="space-y-2">
              {recentOrders.map((ord) => (
                <button
                  key={ord.trackingToken}
                  onClick={() => handleSelectRecent(ord.trackingToken)}
                  className="w-full bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 p-3 rounded-xl flex items-center justify-between transition-all group text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <PackageCheck className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <span className="text-xs font-bold text-zinc-200">
                        Pedido {ord.orderNumber}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    <span>Seguir</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
