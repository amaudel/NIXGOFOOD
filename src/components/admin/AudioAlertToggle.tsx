'use client';

import React from 'react';
import { Volume2, VolumeX, Sparkles, AlertTriangle } from 'lucide-react';
import { useNewOrderAlerts } from '@/context/NewOrderAlertContext';

export const AudioAlertToggle: React.FC = () => {
  const { isAudioMuted, isAudioUnlocked, toggleAudioMute, unlockAudioContext, playTestChime } =
    useNewOrderAlerts();

  const handleToggleOrUnlock = () => {
    if (!isAudioUnlocked) {
      unlockAudioContext();
    } else {
      toggleAudioMute();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleToggleOrUnlock}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
          !isAudioUnlocked
            ? 'bg-amber-950/80 text-amber-300 border-amber-700/80 animate-pulse'
            : isAudioMuted
            ? 'bg-zinc-900 border-zinc-800 text-rose-400 hover:text-rose-300'
            : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 shadow-sm shadow-emerald-950'
        }`}
        title={
          !isAudioUnlocked
            ? 'Haz clic para activar el sonido de nuevas comandas en este navegador'
            : isAudioMuted
            ? 'Activar sonido de alertas de comanda'
            : 'Silenciar sonido de alertas de comanda'
        }
      >
        {!isAudioUnlocked ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        ) : isAudioMuted ? (
          <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
        ) : (
          <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
        )}

        <span>
          {!isAudioUnlocked
            ? '⚠️ Activar alertas'
            : isAudioMuted
            ? '🔇 Alertas silenciadas'
            : '🔊 Alertas activas'}
        </span>
      </button>

      {isAudioUnlocked && !isAudioMuted && (
        <button
          type="button"
          onClick={playTestChime}
          className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-400 hover:text-amber-300 transition-all"
          title="Probar sonido de comanda"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
