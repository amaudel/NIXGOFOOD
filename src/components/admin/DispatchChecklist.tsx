'use client';

import React from 'react';
import { CheckSquare, Square, Package, Coffee, Sparkles, CheckCircle2 } from 'lucide-react';
import { OrderItem } from '@/types';

export interface ChecklistState {
  complete: boolean;
  packaging: boolean;
  extras?: boolean;
  drinks?: boolean;
}

interface DispatchChecklistProps {
  items: OrderItem[];
  checkedState: ChecklistState;
  onToggle: (key: keyof ChecklistState) => void;
}

const DRINK_KEYWORDS = [
  'agua',
  'horchata',
  'limonada',
  'menta',
  'coca',
  'cola',
  'bebida',
  'jugo',
  'gaseosa',
  'soda',
  '500ml',
  '1l',
  'lata',
  'botella',
  'té',
  'te ',
];

export function requiresDrinksCheck(items: OrderItem[]): boolean {
  return items.some((it) => {
    const nameLower = (it.productName || '').toLowerCase();
    const notesLower = (it.notes || '').toLowerCase();
    return DRINK_KEYWORDS.some((kw) => nameLower.includes(kw) || notesLower.includes(kw));
  });
}

export function requiresExtrasCheck(items: OrderItem[]): boolean {
  return items.some((it) => it.selectedModifiers && it.selectedModifiers.length > 0);
}

export function isChecklistComplete(items: OrderItem[], state: ChecklistState): boolean {
  if (!state.complete || !state.packaging) return false;

  if (requiresDrinksCheck(items) && state.drinks !== true) return false;
  if (requiresExtrasCheck(items) && state.extras !== true) return false;

  return true;
}

export const DispatchChecklist: React.FC<DispatchChecklistProps> = ({ items, checkedState, onToggle }) => {
  const hasDrinks = requiresDrinksCheck(items);
  const hasExtras = requiresExtrasCheck(items);
  const isFullyComplete = isChecklistComplete(items, checkedState);

  return (
    <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
        <span className="text-xs font-black text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-amber-400" />
          REVISIÓN DE EXPEDICIÓN
        </span>
        {isFullyComplete ? (
          <span className="text-[10px] font-black text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETO
          </span>
        ) : (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/80">
            Pendiente de revisión
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
        {/* Check 1: Pedido Completo */}
        <button
          type="button"
          onClick={() => onToggle('complete')}
          className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
            checkedState.complete
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700'
              : 'bg-zinc-900/90 text-zinc-400 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          {checkedState.complete ? (
            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Square className="w-4 h-4 text-zinc-500 shrink-0" />
          )}
          <span className="truncate">Pedido completo</span>
        </button>

        {/* Check 2: Empaque */}
        <button
          type="button"
          onClick={() => onToggle('packaging')}
          className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
            checkedState.packaging
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700'
              : 'bg-zinc-900/90 text-zinc-400 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          {checkedState.packaging ? (
            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Square className="w-4 h-4 text-zinc-500 shrink-0" />
          )}
          <span className="truncate">Empaque cerrado</span>
        </button>

        {/* Conditional Check 3: Bebidas */}
        {hasDrinks && (
          <button
            type="button"
            onClick={() => onToggle('drinks')}
            className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
              checkedState.drinks
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:border-amber-700'
            }`}
          >
            {checkedState.drinks ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Coffee className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">Bebidas incluidas</span>
          </button>
        )}

        {/* Conditional Check 4: Extras / Salsas */}
        {hasExtras && (
          <button
            type="button"
            onClick={() => onToggle('extras')}
            className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left ${
              checkedState.extras
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:border-amber-700'
            }`}
          >
            {checkedState.extras ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">Extras y salsas</span>
          </button>
        )}
      </div>
    </div>
  );
};
