'use client';

import React from 'react';
import { Clock, AlertTriangle, Flame } from 'lucide-react';
import { OrderStatus, DeliveryMethod } from '@/types';
import { useKdsClock } from '@/context/KdsClockContext';
import { calculateKdsTimeAnalysis } from '@/lib/kdsTimerHelper';

interface KdsOrderElapsedTimeProps {
  createdAt: string;
  status: OrderStatus;
  deliveryMethod?: DeliveryMethod;
  readyAt?: string;
  compact?: boolean;
}

export const KdsOrderElapsedTime: React.FC<KdsOrderElapsedTimeProps> = ({
  createdAt,
  status,
  deliveryMethod,
  readyAt,
  compact = false,
}) => {
  const now = useKdsClock();
  const analysis = calculateKdsTimeAnalysis(createdAt, now, status, deliveryMethod, readyAt);

  if (status === 'delivered' || status === 'cancelled') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
        <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span>{analysis.formattedTime}</span>
      </div>
    );
  }

  // Severity styling map
  const severityStyles = {
    none: 'bg-zinc-900 border-zinc-800 text-zinc-300',
    normal: 'bg-zinc-950 border-zinc-800 text-zinc-200',
    warning: 'bg-amber-950/70 border-amber-600 text-amber-300 shadow-md shadow-amber-950/40',
    critical: 'bg-rose-950/80 border-rose-600 text-rose-200 shadow-lg shadow-rose-950/60',
    urgent: 'bg-rose-900 border-2 border-rose-500 text-white font-black shadow-xl shadow-rose-950 ring-2 ring-rose-500/50',
  };

  return (
    <div
      aria-label={analysis.ariaText}
      className={`inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 ${
        severityStyles[analysis.severity]
      }`}
    >
      <div className="flex items-center gap-1.5">
        {analysis.severity === 'urgent' ? (
          <Flame className="w-4 h-4 text-rose-400 animate-bounce shrink-0" />
        ) : analysis.severity === 'critical' ? (
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        ) : analysis.severity === 'warning' ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        )}

        <span className="text-xs font-black tracking-wide">{analysis.badgeLabel}</span>
      </div>

      {!compact && analysis.subLabel && analysis.severity !== 'none' && (
        <span className="text-[10px] font-bold opacity-80 pl-1 border-l border-zinc-700/60">
          {analysis.subLabel}
        </span>
      )}
    </div>
  );
};
