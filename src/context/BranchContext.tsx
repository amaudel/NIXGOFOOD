'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Branch, DeliveryZone } from '@/types';
import { getBusinessRepository } from '@/repositories/factory';
import { activeBranch, CURRENT_BUSINESS_ID } from '@/config/business';
import {
  selectNearestCoveringBranch,
  resolvePersistedBranch,
  BranchCoverage,
} from '@/lib/branchSelection';

const STORAGE_KEYS = {
  customer: 'nixgofood_customer_branch',
  admin: 'nixgofood_admin_branch',
} as const;

export interface BranchContextValue {
  branches: Branch[];
  zones: DeliveryZone[];
  selectedBranch: Branch | null;
  selectBranch: (branchId: string) => void;
  autoSelectForLocation: (lat: number, lng: number) => BranchCoverage | null;
  loading: boolean;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export const BranchProvider: React.FC<{
  scope: 'customer' | 'admin';
  children: React.ReactNode;
}> = ({ scope, children }) => {
  const storageKey = STORAGE_KEYS[scope];
  const [branches, setBranches] = useState<Branch[]>([activeBranch]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      try {
        const repo = getBusinessRepository();
        const [branchList, zoneList] = await Promise.all([
          repo.getBranches(CURRENT_BUSINESS_ID),
          repo.getDeliveryZones(),
        ]);
        if (cancelado) return;

        const activas = branchList.filter((b) => b.active !== false);
        const efectivas = activas.length > 0 ? activas : [activeBranch];
        setBranches(efectivas);
        setZones(zoneList);

        // Valida la sucursal persistida: si fue borrada o desactivada, cae a la primera.
        let persistida: string | null = null;
        try {
          persistida = localStorage.getItem(storageKey);
        } catch {
          persistida = null;
        }
        const resuelta = resolvePersistedBranch(efectivas, persistida);
        setSelectedBranchId(resuelta ? resuelta.id : null);
      } catch {
        if (!cancelado) {
          // Fallback de una sucursal: la app sigue operando en modo local unico.
          setBranches([activeBranch]);
          setSelectedBranchId(activeBranch.id);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [storageKey]);

  const selectBranch = useCallback(
    (branchId: string) => {
      setSelectedBranchId(branchId);
      try {
        localStorage.setItem(storageKey, branchId);
      } catch (e) {
        console.error(e);
      }
    },
    [storageKey]
  );

  const autoSelectForLocation = useCallback(
    (lat: number, lng: number): BranchCoverage | null => {
      const cobertura = selectNearestCoveringBranch(branches, zones, lat, lng);
      if (cobertura) selectBranch(cobertura.branch.id);
      return cobertura;
    },
    [branches, zones, selectBranch]
  );

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  const value = useMemo(
    () => ({
      branches,
      zones,
      selectedBranch,
      selectBranch,
      autoSelectForLocation,
      loading,
    }),
    [branches, zones, selectedBranch, selectBranch, autoSelectForLocation, loading]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch debe usarse dentro de un BranchProvider');
  return ctx;
}
