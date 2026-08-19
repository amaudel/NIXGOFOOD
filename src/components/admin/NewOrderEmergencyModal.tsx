'use client';

import React, { useEffect } from 'react';
import { Bell, ChevronRight, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useNewOrderAlerts } from '@/context/NewOrderAlertContext';

interface NewOrderEmergencyModalProps {
  onSelectOrder?: (orderId: string) => void;
}

export const NewOrderEmergencyModal: React.FC<NewOrderEmergencyModalProps> = ({ onSelectOrder }) => {
  const {
    unreviewedOrders,
    isAudioMuted,
    isAudioUnlocked,
    acknowledgeOrder,
    toggleAudioMute,
    unlockAudioContext,
    playTestChime,
  } = useNewOrderAlerts();

  const latestOrder = unreviewedOrders.length > 0 ? unreviewedOrders[0] : null;

  // Continuous Sound & Vibration Loop while Emergency Modal is open
  useEffect(() => {
    if (!latestOrder || isAudioMuted) return;

    const interval = setInterval(() => {
      playTestChime();
      if (
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        'vibrate' in navigator &&
        typeof navigator.vibrate === 'function'
      ) {
        try {
          navigator.vibrate([400, 200, 400, 200, 500]);
        } catch (e) {}
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [latestOrder, isAudioMuted, playTestChime]);

  if (!latestOrder) return null;

  const handleAttendOrder = () => {
    acknowledgeOrder(latestOrder.id);
    if (onSelectOrder) {
      onSelectOrder(latestOrder.id);
    } else {
      const el = document.getElementById(`order-card-${latestOrder.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-gradient-to-b from-rose-950 via-zinc-900 to-zinc-950 border-4 border-rose-600 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-rose-950/90 text-white space-y-6 animate-pulse">
        {/* Ambient Top Flashing Badge */}
        <div className="flex items-center justify-between gap-3 border-b border-rose-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 border-2 border-rose-400 flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-900/80 animate-bounce">
              <Bell className="w-7 h-7" />
            </div>
            <div>
              <span className="inline-block bg-rose-600 text-white text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow">
                🔴 ¡NUEVA COMANDA ENTRANTE!
              </span>
              <p className="text-xs text-rose-200 mt-1 font-bold">
                {unreviewedOrders.length === 1
                  ? 'Atención requerida inmediata en Caja / Cocina'
                  : `${unreviewedOrders.length} comandas sin revisar`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleAudioMute}
            className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-300 hover:text-white"
            title={isAudioMuted ? 'Activar sonido' : 'Silenciar sonido'}
          >
            {isAudioMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
        </div>

        {/* Order Prominent Info Card */}
        <div className="bg-zinc-950/90 p-5 rounded-2xl border border-rose-800/60 space-y-3 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-3xl sm:text-4xl font-black text-white">{latestOrder.orderNumber}</span>
            <span
              className={`text-xs font-black px-3 py-1 rounded-full border ${
                latestOrder.deliveryMethod === 'pickup'
                  ? 'bg-purple-950 text-purple-300 border-purple-800'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-800'
              }`}
            >
              {latestOrder.deliveryMethod === 'pickup' ? '🏪 RETIRO EN LOCAL' : '🛵 DELIVERY'}
            </span>
          </div>

          <div className="space-y-1 text-sm font-bold text-zinc-300">
            <p className="text-white text-base font-extrabold">{latestOrder.customerName}</p>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800">
              <span className="text-zinc-400">Total a cobrar:</span>
              <span className="text-xl font-black text-amber-400">${latestOrder.total?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>

        {/* Audio Unlock Notice if browser blocked sound */}
        {!isAudioUnlocked && (
          <div className="p-3 bg-amber-950/80 border border-amber-600 rounded-xl text-amber-200 text-xs font-bold flex items-center justify-between gap-2">
            <span>🔊 Toca aquí para asegurar sonido continuo</span>
            <button
              onClick={unlockAudioContext}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 font-black text-xs shrink-0"
            >
              ACTIVAR SONIDO
            </button>
          </div>
        )}

        {/* Massive Emergency Primary Button */}
        <button
          type="button"
          onClick={handleAttendOrder}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 font-black text-zinc-950 text-base sm:text-lg shadow-xl shadow-amber-950/50 flex items-center justify-center gap-3 active:scale-95 transition-all uppercase tracking-wide"
        >
          <Sparkles className="w-6 h-6 text-zinc-950 animate-spin" />
          <span>🔔 REVISAR Y ATENDER COMANDA {latestOrder.orderNumber}</span>
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
