import { Branch, BusinessHours, DeliveryZone } from '@/types';
import { calculateDistanceKm } from '@/services/DeliveryService';

export interface BranchCoverage {
  branch: Branch;
  distanceKm: number;
  /** Zona que cubre la distancia; null si la sucursal no llega hasta el cliente. */
  zone: DeliveryZone | null;
}

export function groupZonesByBranch(zones: DeliveryZone[]): Map<string, DeliveryZone[]> {
  const grouped = new Map<string, DeliveryZone[]>();
  zones.forEach((z) => {
    if (!z.branchId) return;
    if (z.active === false) return;
    const list = grouped.get(z.branchId) || [];
    list.push(z);
    grouped.set(z.branchId, list);
  });
  return grouped;
}

export function evaluateBranchCoverage(
  branches: Branch[],
  zones: DeliveryZone[],
  customerLat: number,
  customerLng: number
): BranchCoverage[] {
  const zonesByBranch = groupZonesByBranch(zones);

  return branches
    .filter((b) => b.active !== false)
    .map((branch) => {
      const distanceKm = calculateDistanceKm(
        branch.latitude,
        branch.longitude,
        customerLat,
        customerLng
      );
      // La zona mas pequena que cubre la distancia es la que aplica.
      const sorted = [...(zonesByBranch.get(branch.id) || [])].sort(
        (a, b) => a.maxDistanceKm - b.maxDistanceKm
      );
      const zone = sorted.find((z) => distanceKm <= z.maxDistanceKm) || null;
      return { branch, distanceKm, zone };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function selectNearestCoveringBranch(
  branches: Branch[],
  zones: DeliveryZone[],
  customerLat: number,
  customerLng: number
): BranchCoverage | null {
  const covering = evaluateBranchCoverage(branches, zones, customerLat, customerLng).filter(
    (c) => c.zone !== null
  );
  return covering[0] || null;
}

/** Horarios de una sucursal concreta. */
export function hoursForBranch(hours: BusinessHours[], branchId: string): BusinessHours[] {
  return hours.filter((h) => h.branchId === branchId);
}

export function resolvePersistedBranch(
  branches: Branch[],
  persistedId: string | null
): Branch | null {
  const activas = branches.filter((b) => b.active !== false);
  if (activas.length === 0) return null;
  const guardada = persistedId ? activas.find((b) => b.id === persistedId) : undefined;
  return guardada || activas[0];
}
