'use client';

import React from 'react';
import { OrderItem } from '@/types';

interface OrderItemsListProps {
  items: OrderItem[];
  notes?: string;
  compact?: boolean;
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({ items, notes, compact = false }) => {
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-zinc-800/80">
        {items.map((item, idx) => (
          <li key={idx} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-extrabold text-white text-sm">
                <span className="text-amber-400 font-black mr-1.5">{item.quantity}×</span>
                {item.productName}
              </span>
              {!compact && item.unitPrice !== undefined && (
                <span className="text-xs font-bold text-zinc-400">
                  ${(item.unitPrice * item.quantity).toFixed(2)}
                </span>
              )}
            </div>

            {/* Modifiers List */}
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <ul className="mt-1 pl-4 space-y-0.5 border-l border-amber-500/30">
                {item.selectedModifiers.map((mod, mIdx) => (
                  <li key={mIdx} className="text-xs text-zinc-300 font-medium">
                    + {mod.modifierName}
                    {mod.price > 0 && !compact && (
                      <span className="text-zinc-500 text-[10px] ml-1">
                        (+${mod.price.toFixed(2)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {/* Kitchen Notes */}
      {notes && notes.trim() !== '' && (
        <div className="mt-2 p-2.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200">
          <span className="font-extrabold block text-amber-400 mb-0.5">📝 NOTA DE COCINA:</span>
          {notes}
        </div>
      )}
    </div>
  );
};
