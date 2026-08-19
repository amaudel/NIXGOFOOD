'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Undo2, X } from 'lucide-react';
import { OrderStatus } from '@/types';

export interface ActiveUndoToast {
  orderId: string;
  orderNumber: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  timestamp: number;
}

interface UndoToastNotificationProps {
  toast: ActiveUndoToast | null;
  onUndo: (toast: ActiveUndoToast) => void;
  onDismiss: () => void;
}

const getStatusLabel = (s: OrderStatus): string => {
  switch (s) {
    case 'new':
      return 'Nuevo';
    case 'preparing':
      return 'En preparación';
    case 'ready':
      return 'Listo';
    case 'on_the_way':
      return 'En camino';
    case 'delivered':
      return 'Entregado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return s;
  }
};

export const UndoToastNotification: React.FC<UndoToastNotificationProps> = ({
  toast,
  onUndo,
  onDismiss,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(5);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!toast) return;

    const DURATION_MS = 5000;
    const startTime = toast.timestamp || Date.now();

    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      const remainingMs = DURATION_MS - elapsed;
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingMs <= 0) {
        setTimeLeft(0);
        onDismissRef.current();
      } else {
        setTimeLeft(remainingSec);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);

    return () => clearInterval(interval);
  }, [toast?.orderId, toast?.timestamp]);

  if (!toast) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 bg-zinc-900 border-2 border-amber-500 text-white rounded-2xl p-4 shadow-2xl shadow-zinc-950/80 max-w-sm w-full transition-all duration-300"
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
            <span>✅ ESTADO ACTUALIZADO</span>
          </div>
          <p className="text-xs font-bold text-zinc-100">
            {toast.orderNumber} marcado como <strong className="text-amber-300">{getStatusLabel(toast.toStatus)}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUndo(toast)}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-black px-3.5 py-2 rounded-xl text-xs shadow-lg active:scale-95 transition-all"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>DESHACER ({Math.max(0, timeLeft)}s)</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Countdown Progress Bar */}
      <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
        <div
          className="bg-amber-400 h-full transition-all duration-200 ease-linear"
          style={{ width: `${Math.max(0, (timeLeft / 5) * 100)}%` }}
        />
      </div>
    </div>
  );
};
