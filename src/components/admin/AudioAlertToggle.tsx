'use client';

import React from 'react';
import { Volume2, VolumeX, Sparkles, AlertTriangle } from 'lucide-react';
import { useNewOrderAlerts } from '@/context/NewOrderAlertContext';

/**
 * `compact` lo usa la barra superior en movil: ahi el texto completo
 * ("⚠️ Activar alertas") hacia que la barra midiera 478px en una pantalla de
 * 375px, empujando este boton y la hamburguesa fuera de la pantalla. En
 * compacto queda solo el icono, que es lo unico que hace falta para tocarlo.
 */
export const AudioAlertToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
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
        className={`inline-flex items-center justify-center gap-2 rounded-xl text-xs font-extrabold transition-all border ${
          compact ? 'w-11 h-11 shrink-0' : 'px-3 py-1.5'
        } ${
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

        {!compact && (
          <span>
            {!isAudioUnlocked
              ? '⚠️ Activar alertas'
              : isAudioMuted
              ? '🔇 Alertas silenciadas'
              : '🔊 Alertas activas'}
          </span>
        )}
      </button>

      {!compact && isAudioUnlocked && !isAudioMuted && (
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
