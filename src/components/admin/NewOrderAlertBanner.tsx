'use client';

import React from 'react';
import { Bell, Volume2, VolumeX, ChevronRight, Sparkles } from 'lucide-react';
import { useNewOrderAlerts } from '@/context/NewOrderAlertContext';

interface NewOrderAlertBannerProps {
  onSelectOrder?: (orderId: string) => void;
}

export const NewOrderAlertBanner: React.FC<NewOrderAlertBannerProps> = ({ onSelectOrder }) => {
  const {
    unreviewedOrders,
    isAudioMuted,
    isAudioUnlocked,
    hasShakeActive,
    acknowledgeOrder,
    toggleAudioMute,
    unlockAudioContext,
    playTestChime,
  } = useNewOrderAlerts();

  if (unreviewedOrders.length === 0) {
    return null;
  }

  const latestOrder = unreviewedOrders[0];

  const handleOpenOrder = (id: string) => {
    acknowledgeOrder(id);
    if (onSelectOrder) {
      onSelectOrder(id);
    } else {
      const el = document.getElementById(`order-card-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div
      className={`w-full bg-gradient-to-r from-rose-950 via-rose-900 to-amber-950 border-2 border-rose-500 rounded-3xl p-4 sm:p-5 shadow-2xl shadow-rose-950/80 text-white relative overflow-hidden transition-all duration-300 ${
        hasShakeActive ? 'animate-bounce scale-[1.01]' : 'animate-pulse'
      }`}
      role="alert"
      aria-live="assertive"
    >
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-sm pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left Column: Icon & Details */}
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 border border-rose-400 flex items-center justify-center shrink-0 shadow-lg animate-pulse">
            <Bell className="w-6 h-6 text-white" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-rose-500 text-zinc-950 font-black text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow">
                🔴 {unreviewedOrders.length === 1 ? 'NUEVA COMANDA RECIBIDA' : `${unreviewedOrders.length} COMANDAS SIN REVISAR`}
              </span>
              {!isAudioUnlocked && (
                <button
                  type="button"
                  onClick={unlockAudioContext}
                  className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] px-2.5 py-0.5 rounded-full transition-all animate-bounce"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Activar Sonido</span>
                </button>
              )}
            </div>

            <h3 className="text-lg sm:text-xl font-black text-white truncate">
              {latestOrder.orderNumber} · {latestOrder.customerName}
            </h3>

            <p className="text-xs text-rose-200 font-medium flex items-center gap-2 flex-wrap">
              <span>{latestOrder.deliveryMethod === 'delivery' ? '🛵 Delivery' : '🏪 Retiro en local'}</span>
              <span>·</span>
              <span className="font-bold text-amber-300">${latestOrder.total?.toFixed(2) || '0.00'}</span>
            </p>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-rose-800/80">
          {/* Mute/Unmute Quick Toggle */}
          <button
            type="button"
            onClick={toggleAudioMute}
            className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5"
            title={isAudioMuted ? 'Activar sonido de alertas' : 'Silenciar sonido de alertas'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Test Sound */}
          <button
            type="button"
            onClick={playTestChime}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-amber-300 hover:text-amber-200 px-3 py-2 rounded-xl bg-zinc-950/60 border border-amber-500/40"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Probar Sonido</span>
          </button>

          {/* Primary Action: Open Order */}
          <button
            type="button"
            onClick={() => handleOpenOrder(latestOrder.id)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-black px-6 py-3 rounded-2xl shadow-xl active:scale-95 transition-all text-xs sm:text-sm"
          >
            <span>VER COMANDA {latestOrder.orderNumber}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
