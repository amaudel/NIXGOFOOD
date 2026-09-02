'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Branch, DeliveryZone } from '@/types';
import { getBusinessRepository } from '@/repositories/factory';
import { activeBranch } from '@/config/business';
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
  /** Si selectedBranch viene de una eleccion explicita del cliente (BranchPicker
   * o restaurada de una sesion anterior) en vez de la auto-seleccion por cercania. */
  manuallySelected: boolean;
  selectBranch: (branchId: string) => void;
  autoSelectForLocation: (lat: number, lng: number) => BranchCoverage | null;
  loading: boolean;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export const BranchProvider: React.FC<{
  scope: 'customer' | 'admin';
  businessId: string;
  children: React.ReactNode;
}> = ({ scope, businessId, children }) => {
  const storageKey = STORAGE_KEYS[scope];
  const [branches, setBranches] = useState<Branch[]>([activeBranch]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [manuallySelected, setManuallySelected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      try {
        const repo = getBusinessRepository();
        const [branchList, zoneList] = await Promise.all([
          repo.getBranches(businessId),
          repo.getDeliveryZones(undefined, businessId),
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
        // Si habia una sucursal guardada y sigue siendo valida, es la misma
        // eleccion explicita de una sesion anterior -- no un default del
        // sistema -- asi que cuenta como manual igual que un clic en
        // BranchPicker.
        setManuallySelected(!!persistida && resuelta?.id === persistida);
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
  }, [storageKey, businessId]);

  // `manual` distingue quien elige la sucursal: true cuando el cliente la
  // clickeo a mano (BranchPicker) o la traia guardada de una sesion
  // anterior, false cuando la elige el sistema por cercania. AppContext usa
  // ese flag para saber si debe respetar la eleccion actual al recotizar.
  const applyBranchSelection = useCallback(
    (branchId: string, manual: boolean) => {
      setSelectedBranchId(branchId);
      setManuallySelected(manual);
      try {
        localStorage.setItem(storageKey, branchId);
      } catch (e) {
        console.error(e);
      }
    },
    [storageKey]
  );

  const selectBranch = useCallback(
    (branchId: string) => applyBranchSelection(branchId, true),
    [applyBranchSelection]
  );

  const autoSelectForLocation = useCallback(
    (lat: number, lng: number): BranchCoverage | null => {
      const cobertura = selectNearestCoveringBranch(branches, zones, lat, lng);
      if (cobertura) applyBranchSelection(cobertura.branch.id, false);
      return cobertura;
    },
    [branches, zones, applyBranchSelection]
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
      manuallySelected,
      selectBranch,
      autoSelectForLocation,
      loading,
    }),
    [branches, zones, selectedBranch, manuallySelected, selectBranch, autoSelectForLocation, loading]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch debe usarse dentro de un BranchProvider');
  return ctx;
}
