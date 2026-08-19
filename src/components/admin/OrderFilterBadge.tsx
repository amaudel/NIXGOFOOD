'use client';

import React from 'react';
import { OrderFilterConfig, formatBadgeCount } from '@/config/orderFilters';

interface OrderFilterBadgeProps {
  count: number;
  config: OrderFilterConfig;
}

export const OrderFilterBadge: React.FC<OrderFilterBadgeProps> = ({ count, config }) => {
  if (count <= 0) return null;

  const displayValue = formatBadgeCount(count);
  const isSingleDigit = count >= 1 && count <= 9;
  const { bg, text, border, pulse } = config.badgeStyle;

  return (
    <span
      className={`inline-flex items-center justify-center text-[10px] font-black leading-none shadow-sm transition-all ${bg} ${text} ${
        border || ''
      } ${pulse ? 'animate-pulse' : ''} ${
        isSingleDigit ? 'w-5 h-5 rounded-full shrink-0' : 'px-2 py-0.5 rounded-full min-w-[20px] shrink-0'
      }`}
    >
      {displayValue}
    </span>
  );
};
