'use client';

import React from 'react';
import { Store } from 'lucide-react';
import { useBranch } from '@/context/BranchContext';

export const BranchSwitcher: React.FC = () => {
  const { branches, selectedBranch, selectBranch, loading } = useBranch();

  if (loading || branches.length === 0) return null;

  return (
    <label className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 h-10">
      <Store className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="sr-only">Sucursal activa</span>
      <select
        value={selectedBranch?.id || ''}
        onChange={(e) => selectBranch(e.target.value)}
        className="bg-transparent text-xs font-extrabold text-zinc-100 outline-none max-w-[190px]"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id} className="bg-zinc-900">
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
};
