'use client';

import React from 'react';
import { MapPin, Phone, Check } from 'lucide-react';
import { useBranch } from '@/context/BranchContext';
import { useApp } from '@/context/AppContext';
import { evaluateBranchCoverage } from '@/lib/branchSelection';

export const BranchPicker: React.FC<{ mode: 'delivery' | 'pickup' }> = ({ mode }) => {
  const { branches, zones, selectedBranch, selectBranch } = useBranch();
  const { deliveryLocation } = useApp();

  const conCobertura =
    mode === 'delivery' && deliveryLocation.hasSelectedLocation
      ? evaluateBranchCoverage(branches, zones, deliveryLocation.latitude, deliveryLocation.longitude)
      : null;

  const filas = conCobertura
    ? conCobertura
    : branches.filter((b) => b.active !== false).map((branch) => ({ branch, distanceKm: null, zone: null }));

  return (
    <div className="space-y-2">
      {filas.map(({ branch, distanceKm, zone }: any) => {
        const esElegida = selectedBranch?.id === branch.id;
        const sinCobertura = mode === 'delivery' && conCobertura && !zone;
        return (
          <button
            key={branch.id}
            type="button"
            disabled={!!sinCobertura}
            onClick={() => selectBranch(branch.id)}
            className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
              esElegida
                ? 'bg-amber-950/40 border-amber-700 text-white'
                : sinCobertura
                ? 'bg-zinc-950 border-zinc-850 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-sm">{branch.name}</span>
              {esElegida && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
            </div>
            <span className="text-[11px] text-zinc-400 flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {branch.address}
            </span>
            {mode === 'pickup' && branch.phone && (
              <span className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" />
                {branch.phone}
              </span>
            )}
            {distanceKm !== null && (
              <span className="text-[11px] font-bold text-zinc-300 mt-1 block">
                {sinCobertura ? 'No llega a tu dirección' : `A ${distanceKm} km · Envío $${zone.fee.toFixed(2)}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
