import { describe, it, expect } from 'vitest';
import { Branch, DeliveryZone } from '@/types';
import {
  groupZonesByBranch,
  evaluateBranchCoverage,
  selectNearestCoveringBranch,
  resolvePersistedBranch,
} from '@/lib/branchSelection';

const BIZ = 'biz-1';

// Centro de Cuenca
const matriz: Branch = {
  id: 'br-matriz', businessId: BIZ, name: 'Matriz',
  address: 'Centro', latitude: -2.90055, longitude: -79.00453, active: true,
};
// ~3.5 km al norte de la matriz
const norte: Branch = {
  id: 'br-norte', businessId: BIZ, name: 'Norte',
  address: 'Norte', latitude: -2.86900, longitude: -79.00453, active: true,
};

const zone = (id: string, branchId: string, maxKm: number, fee: number): DeliveryZone => ({
  id, businessId: BIZ, branchId, name: `Zona ${maxKm}km`,
  maxDistanceKm: maxKm, fee, estimatedMinutes: '20-30 min', active: true,
});

describe('groupZonesByBranch', () => {
  it('agrupa las zonas por su sucursal', () => {
    const zones = [zone('z1', 'br-matriz', 2, 1.5), zone('z2', 'br-norte', 4, 2)];
    const grouped = groupZonesByBranch(zones);
    expect(grouped.get('br-matriz')).toHaveLength(1);
    expect(grouped.get('br-norte')).toHaveLength(1);
  });

  it('ignora zonas sin branchId', () => {
    const huerfana = { ...zone('z9', 'br-matriz', 2, 1.5), branchId: undefined };
    expect(groupZonesByBranch([huerfana]).size).toBe(0);
  });
});

describe('evaluateBranchCoverage', () => {
  it('elige la zona mas pequena que cubre la distancia', () => {
    // Cliente a ~1 km de la matriz
    const zones = [
      zone('z-lejos', 'br-matriz', 6, 2.5),
      zone('z-cerca', 'br-matriz', 2, 1.5),
    ];
    const [result] = evaluateBranchCoverage([matriz], zones, -2.89155, -79.00453);
    expect(result.zone?.id).toBe('z-cerca');
    expect(result.zone?.fee).toBe(1.5);
  });

  it('marca zone null cuando ninguna zona alcanza', () => {
    const zones = [zone('z1', 'br-matriz', 1, 1.5)];
    const [result] = evaluateBranchCoverage([matriz], zones, -2.86900, -79.00453);
    expect(result.zone).toBeNull();
    expect(result.distanceKm).toBeGreaterThan(1);
  });

  it('ordena por distancia ascendente', () => {
    const zones = [zone('z1', 'br-matriz', 6, 1.5), zone('z2', 'br-norte', 6, 2)];
    const results = evaluateBranchCoverage([norte, matriz], zones, -2.89155, -79.00453);
    expect(results[0].branch.id).toBe('br-matriz');
  });

  it('excluye sucursales inactivas', () => {
    const cerrada = { ...matriz, active: false };
    const zones = [zone('z1', 'br-matriz', 6, 1.5)];
    expect(evaluateBranchCoverage([cerrada], zones, -2.89155, -79.00453)).toHaveLength(0);
  });
});

describe('selectNearestCoveringBranch', () => {
  it('devuelve la sucursal mas cercana cuando cubre', () => {
    const zones = [zone('z1', 'br-matriz', 6, 1.5), zone('z2', 'br-norte', 6, 2)];
    const result = selectNearestCoveringBranch([matriz, norte], zones, -2.89155, -79.00453);
    expect(result?.branch.id).toBe('br-matriz');
  });

  it('gana una sucursal mas lejana si la mas cercana no cubre', () => {
    // Cliente a ~1 km de matriz y ~2.5 km de norte.
    // Matriz solo cubre 0.5 km; norte cubre 6 km.
    const zones = [zone('z-matriz', 'br-matriz', 0.5, 1.5), zone('z-norte', 'br-norte', 6, 2)];
    const result = selectNearestCoveringBranch([matriz, norte], zones, -2.89155, -79.00453);
    expect(result?.branch.id).toBe('br-norte');
    expect(result?.zone?.fee).toBe(2);
  });

  it('devuelve null si ninguna sucursal cubre', () => {
    const zones = [zone('z1', 'br-matriz', 0.1, 1.5), zone('z2', 'br-norte', 0.1, 2)];
    expect(selectNearestCoveringBranch([matriz, norte], zones, -2.89155, -79.00453)).toBeNull();
  });

  it('devuelve null sin sucursales', () => {
    expect(selectNearestCoveringBranch([], [], -2.9, -79.0)).toBeNull();
  });
});

describe('resolvePersistedBranch', () => {
  it('devuelve la sucursal guardada si sigue activa', () => {
    expect(resolvePersistedBranch([matriz, norte], 'br-norte')?.id).toBe('br-norte');
  });

  it('cae a la primera si la guardada ya no existe', () => {
    expect(resolvePersistedBranch([matriz, norte], 'br-borrada')?.id).toBe('br-matriz');
  });

  it('cae a la primera si la guardada fue desactivada', () => {
    const norteInactiva = { ...norte, active: false };
    expect(resolvePersistedBranch([matriz, norteInactiva], 'br-norte')?.id).toBe('br-matriz');
  });

  it('devuelve null sin sucursales', () => {
    expect(resolvePersistedBranch([], 'br-matriz')).toBeNull();
  });
});
