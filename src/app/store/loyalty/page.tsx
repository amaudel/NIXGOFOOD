'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gift, Search, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getLoyaltyBalance } from '@/lib/loyalty';
import { LoyaltyBalance } from '@/types';

export default function LoyaltyBalancePage() {
  const { businessId, business } = useApp();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBalance(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || !businessId) {
      setError('Ingresa un teléfono válido.');
      return;
    }

    setLoading(true);
    try {
      const result = await getLoyaltyBalance(businessId, phone);
      setBalance(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 sm:py-8 space-y-6 min-h-screen">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-xs sm:text-sm font-bold transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-rose-500" />
        <span>Volver al menú</span>
      </Link>

      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shadow-inner">
          <Gift className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-black text-white">Mis puntos</h1>
        <p className="text-xs text-zinc-400">
          Consulta cuántos puntos tienes acumulados en {business?.name || 'este negocio'}.
        </p>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-start gap-2.5 text-xs text-zinc-400">
        <Gift className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span>
          Ganas puntos automáticamente cada vez que un pedido tuyo llega a "entregado", y los puedes
          canjear por descuento en tu próximo pedido. No necesitas crear una cuenta — alcanza con tu
          número de teléfono.
        </span>
      </div>

      <form onSubmit={handleSearch} className="space-y-4 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Teléfono
          </label>
          <input
            type="tel"
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
          <Search className="w-4 h-4" />
          <span>{loading ? 'Consultando...' : 'Consultar saldo'}</span>
        </button>
      </form>

      {balance && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-center space-y-2 shadow-2xl">
          {balance.availablePoints > 0 ? (
            <>
              <div className="text-3xl font-black text-amber-400">{balance.availablePoints} puntos</div>
              <p className="text-sm text-zinc-300">
                Valen aproximadamente <strong>${balance.pointsValue.toFixed(2)}</strong> de descuento en tu
                próximo pedido.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              No tienes puntos disponibles con ese teléfono en este negocio todavía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
