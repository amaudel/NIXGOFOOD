# Multi-sucursal (Fase 1) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que NixgoFood opere varias sucursales, con asignación automática por cercanía en el cliente y un selector de sucursal en el panel admin.

**Architecture:** Se reemplaza la constante `activeBranch` por un `BranchProvider` de React que carga las sucursales del repositorio. La lógica de elección de sucursal vive en un módulo puro y testeable (`src/lib/branchSelection.ts`); el contexto solo orquesta. Las zonas de delivery pasan a leerse de la base de datos por sucursal en lugar del array hardcodeado. Las URLs no cambian.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Supabase (PostgREST + Realtime), Leaflet, Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-multi-sucursal-design.md`

## Global Constraints

- El menú (productos, categorías, modificadores y precios) es **del negocio**, nunca de la sucursal. Ninguna tarea filtra el catálogo por sucursal.
- No se borran sucursales: solo se desactivan (`active = false`). Los pedidos las referencian por clave foránea.
- Toda la interfaz de usuario va en **español**, siguiendo el tono existente (ej. "Te atiende", "Sucursal", "Retiro en local").
- El modo demo debe funcionar sin Supabase: cada cambio de repositorio se implementa en la versión Supabase **y** en la demo.
- Los repositorios nunca lanzan por fallo de red: devuelven un fallback (patrón existente en `SupabaseBusinessRepository`).
- Claves de persistencia exactas: `nixgofood_customer_branch` y `nixgofood_admin_branch`.
- Los commits van en español, en imperativo, sin acentos en el asunto (patrón del repo).

---

### Task 1: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json:5-11` (bloque `scripts`), `package.json:29-39` (bloque `devDependencies`)
- Test: `src/lib/__tests__/orderSupervision.test.ts` (ya existe, hoy no se ejecuta)

**Interfaces:**
- Consumes: nada.
- Produces: el comando `npm test` (modo run, no watch) y `npm run test:watch`. Todas las tareas siguientes dependen de que esto funcione.

- [ ] **Step 1: Instalar Vitest**

```bash
npm install --save-dev vitest@^3.2.4
```

- [ ] **Step 2: Crear la configuración**

Crear `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

El alias `@` es obligatorio: los tests importan con `@/types` y sin esto fallan al resolver.

- [ ] **Step 3: Añadir los scripts**

En `package.json`, dentro de `"scripts"`, añadir:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Ejecutar los tests huérfanos**

Run: `npm test`
Expected: Vitest descubre los 3 archivos de `src/lib/__tests__/`. Si alguno falla, **no lo arregles a ciegas**: anota el fallo y repórtalo — son tests que nunca se han ejecutado y pueden estar desactualizados respecto al código actual.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: configurar Vitest y habilitar los tests existentes"
```

---

### Task 2: Lógica pura de selección de sucursal

**Files:**
- Create: `src/lib/branchSelection.ts`
- Test: `src/lib/__tests__/branchSelection.test.ts`

**Interfaces:**
- Consumes: `Branch` y `DeliveryZone` de `@/types`; `calculateDistanceKm` de `@/services/DeliveryService`.
- Produces:
  ```ts
  export interface BranchCoverage {
    branch: Branch;
    distanceKm: number;
    zone: DeliveryZone | null; // zona que cubre; null si la sucursal no llega
  }
  export function groupZonesByBranch(zones: DeliveryZone[]): Map<string, DeliveryZone[]>;
  export function evaluateBranchCoverage(branches: Branch[], zones: DeliveryZone[], customerLat: number, customerLng: number): BranchCoverage[];
  export function selectNearestCoveringBranch(branches: Branch[], zones: DeliveryZone[], customerLat: number, customerLng: number): BranchCoverage | null;
  export function resolvePersistedBranch(branches: Branch[], persistedId: string | null): Branch | null;
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/__tests__/branchSelection.test.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- branchSelection`
Expected: FAIL — no existe `src/lib/branchSelection.ts`.

- [ ] **Step 3: Implementar**

Crear `src/lib/branchSelection.ts`:

```ts
import { Branch, DeliveryZone } from '@/types';
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

export function resolvePersistedBranch(
  branches: Branch[],
  persistedId: string | null
): Branch | null {
  const activas = branches.filter((b) => b.active !== false);
  if (activas.length === 0) return null;
  const guardada = persistedId ? activas.find((b) => b.id === persistedId) : undefined;
  return guardada || activas[0];
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- branchSelection`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branchSelection.ts src/lib/__tests__/branchSelection.test.ts
git commit -m "feat: logica pura de seleccion de sucursal por cercania y cobertura"
```

---

### Task 3: DeliveryService recibe las zonas en vez de usar el array fijo

**Files:**
- Modify: `src/services/DeliveryService.ts:1-104`
- Test: `src/lib/__tests__/deliveryService.test.ts` (crear)

**Interfaces:**
- Consumes: `DeliveryCalculationParams`, `DeliveryQuote`, `DeliveryZone` de `@/types`.
- Produces: `DeliveryService.calculateDeliveryFee(params: DeliveryCalculationParams, zones: DeliveryZone[]): DeliveryQuote`. La sobrecarga `(lat, lng)` y el array exportado `deliveryZones` **desaparecen**. `calculateDistanceKm` se mantiene igual (Task 2 ya la usa).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/__tests__/deliveryService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DeliveryZone } from '@/types';
import { DeliveryService, calculateDistanceKm } from '@/services/DeliveryService';

const zones: DeliveryZone[] = [
  { id: 'z1', businessId: 'b', branchId: 'br', name: 'Zona 1', maxDistanceKm: 2, fee: 1.5, estimatedMinutes: '20-30 min' },
  { id: 'z3', businessId: 'b', branchId: 'br', name: 'Zona 3', maxDistanceKm: 6, fee: 2.5, estimatedMinutes: '35-45 min' },
];

const params = (custLat: number) => ({
  branchLatitude: -2.90055,
  branchLongitude: -79.00453,
  customerLatitude: custLat,
  customerLongitude: -79.00453,
});

describe('calculateDistanceKm', () => {
  it('da 0 para el mismo punto', () => {
    expect(calculateDistanceKm(-2.9, -79.0, -2.9, -79.0)).toBe(0);
  });
});

describe('DeliveryService.calculateDeliveryFee', () => {
  it('cobra la zona mas pequena que cubre', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.89155), zones);
    expect(quote.available).toBe(true);
    expect(quote.fee).toBe(1.5);
    expect(quote.zoneId).toBe('z1');
  });

  it('usa una zona mayor cuando la chica no alcanza', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.87), zones);
    expect(quote.available).toBe(true);
    expect(quote.fee).toBe(2.5);
  });

  it('marca no disponible fuera de cobertura', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.80), zones);
    expect(quote.available).toBe(false);
    expect(quote.fee).toBe(0);
    expect(quote.reason).toBeTruthy();
  });

  it('marca no disponible si la sucursal no tiene zonas', () => {
    const quote = DeliveryService.calculateDeliveryFee(params(-2.89155), []);
    expect(quote.available).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- deliveryService`
Expected: FAIL — `calculateDeliveryFee` aún ignora el segundo parámetro y usa el array fijo.

- [ ] **Step 3: Reescribir el servicio**

Reemplazar el contenido completo de `src/services/DeliveryService.ts` por:

```ts
import { DeliveryQuote, DeliveryCalculationParams, DeliveryZone } from '@/types';

/**
 * Haversine formula to compute geographical distance in Kilometers between two coordinates
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal place e.g. 3.4 km
}

export class DeliveryService {
  /**
   * Calcula la tarifa a partir de las zonas de UNA sucursal.
   * Las zonas llegan siempre desde el repositorio: no hay tabla de zonas en codigo.
   */
  static calculateDeliveryFee(
    params: DeliveryCalculationParams,
    zones: DeliveryZone[]
  ): DeliveryQuote {
    const distanceKm = calculateDistanceKm(
      params.branchLatitude,
      params.branchLongitude,
      params.customerLatitude,
      params.customerLongitude
    );

    const sortedZones = [...zones]
      .filter((z) => z.active !== false)
      .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
    const matchedZone = sortedZones.find((zone) => distanceKm <= zone.maxDistanceKm);

    if (matchedZone) {
      return {
        available: true,
        zoneId: matchedZone.id,
        zoneName: matchedZone.name,
        fee: matchedZone.fee,
        estimatedMinutes: matchedZone.estimatedMinutes,
        distanceKm,
      };
    }

    const maxCobertura = sortedZones.length
      ? `${sortedZones[sortedZones.length - 1].maxDistanceKm} km`
      : 'la zona configurada';

    return {
      available: false,
      fee: 0,
      distanceKm,
      reason: `Esta ubicación está fuera de nuestra zona de delivery (máximo ${maxCobertura}).`,
    };
  }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- deliveryService`
Expected: PASS, 5 tests.

- [ ] **Step 5: Localizar las llamadas rotas**

Run: `npx tsc --noEmit`
Expected: errores en `src/context/AppContext.tsx` (3 llamadas, líneas ~242, ~263) y en cualquier otro consumidor de `deliveryZones`.

Run: `grep -rn "calculateDeliveryFee\|deliveryZones" src/ --include=*.ts --include=*.tsx`

**No arregles `AppContext` aquí** — lo hace la Task 7, que ya tendrá el contexto de sucursal para saber qué zonas pasar. Si algún otro archivo importa `deliveryZones` (por ejemplo `DeliveryClientPage` para prellenar el formulario), sustitúyelo por una llamada al repositorio en esta misma tarea; si no, continúa.

- [ ] **Step 6: Commit**

```bash
git add src/services/DeliveryService.ts src/lib/__tests__/deliveryService.test.ts
git commit -m "refactor: DeliveryService calcula con las zonas recibidas y no con una tabla fija"
```

> Nota: el árbol queda temporalmente sin compilar por `AppContext`. Es intencional; la Task 7 lo cierra. Si prefieres no dejar `main` roto, ejecuta las tareas 3 a 7 antes de publicar.

---

### Task 4: Capa de repositorio multi-sucursal (Supabase)

**Files:**
- Modify: `src/repositories/interfaces/IBusinessRepository.ts:1-12`
- Modify: `src/repositories/supabase/SupabaseBusinessRepository.ts:54-130`

**Interfaces:**
- Consumes: `Branch`, `DeliveryZone`, `BusinessHours` de `@/types`.
- Produces, en `IBusinessRepository`:
  ```ts
  getBranches(businessId?: string): Promise<Branch[]>;
  getBranch(branchId: string): Promise<Branch | null>;
  saveBranch(branch: Partial<Branch>): Promise<Branch>;   // inserta si no trae id
  getDeliveryZones(branchId?: string): Promise<DeliveryZone[]>; // sin branchId = todas las del negocio
  getBusinessHours(branchId?: string): Promise<BusinessHours[]>;
  ```

- [ ] **Step 1: Actualizar la interfaz**

En `src/repositories/interfaces/IBusinessRepository.ts`, reemplazar las firmas de sucursal y añadir `getBranches`:

```ts
import { Business, Branch, DeliveryZone, BusinessHours } from '@/types';

export interface IBusinessRepository {
  getBusiness(businessId?: string): Promise<Business | null>;
  saveBusiness(business: Partial<Business>): Promise<Business>;
  getBranches(businessId?: string): Promise<Branch[]>;
  getBranch(branchId: string): Promise<Branch | null>;
  saveBranch(branch: Partial<Branch>): Promise<Branch>;
  getDeliveryZones(branchId?: string): Promise<DeliveryZone[]>;
  saveDeliveryZones(zones: DeliveryZone[]): Promise<void>;
  getBusinessHours(branchId?: string): Promise<BusinessHours[]>;
  saveBusinessHours(hours: BusinessHours[]): Promise<void>;
}
```

- [ ] **Step 2: Corregir los dos bugs de sucursal en Supabase**

En `SupabaseBusinessRepository.ts`, reemplazar `getBranch` y `saveBranch` (líneas 54-89) por:

```ts
  private mapBranch(data: any): Branch {
    return {
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      address: data.address,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      phone: data.phone || '',
      active: data.active,
    };
  }

  async getBranches(businessId: string = CURRENT_BUSINESS_ID): Promise<Branch[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true });
      if (error || !data || data.length === 0) return [activeBranch];
      return data.map((d: any) => this.mapBranch(d));
    } catch {
      return [activeBranch];
    }
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .maybeSingle();
      if (error || !data) return null;
      return this.mapBranch(data);
    } catch {
      return null;
    }
  }

  async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    const supabase = createClient();
    const payload = {
      business_id: CURRENT_BUSINESS_ID,
      name: branch.name,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
      phone: branch.phone,
      active: branch.active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (branch.id) {
      const { data, error } = await supabase
        .from('branches')
        .update(payload)
        .eq('id', branch.id)
        .select()
        .single();
      if (error) throw new Error(`Error Supabase: ${error.message}`);
      return this.mapBranch(data);
    }

    const { data, error } = await supabase.from('branches').insert(payload).select().single();
    if (error) throw new Error(`Error Supabase: ${error.message}`);
    return this.mapBranch(data);
  }
```

Los dos bugs que esto corrige: `getBranch` filtraba por `business_id` con `.single()` —que **falla** en cuanto hay dos sucursales— y `saveBranch` actualizaba por `business_id`, es decir, escribía sobre todas las sucursales a la vez.

`getBranches` devuelve `[activeBranch]` si la consulta falla o viene vacía: es el fallback de una-sucursal que exige el spec.

- [ ] **Step 3: Filtrar zonas y horarios por sucursal**

En el mismo archivo, cambiar las firmas de `getDeliveryZones` y `getBusinessHours` para aceptar `branchId` opcional. En `getDeliveryZones` (línea ~94), tras `.eq('active', true)` añadir el filtro condicional:

```ts
  async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    try {
      const supabase = createClient();
      let query = supabase
        .from('delivery_zones')
        .select('*')
        .eq('business_id', CURRENT_BUSINESS_ID)
        .eq('active', true);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data } = await query;
      return (data || []).map((z: any) => ({
        id: z.id,
        businessId: z.business_id,
        branchId: z.branch_id,
        name: z.name,
        maxDistanceKm: parseFloat(z.max_distance_km),
        fee: parseFloat(z.fee),
        estimatedMinutes: `${z.estimated_min_minutes}-${z.estimated_max_minutes} min`,
        active: z.active,
      }));
    } catch {
      return [];
    }
  }
```

Aplicar el mismo patrón (`let query = ...; if (branchId) query = query.eq('branch_id', branchId);`) a `getBusinessHours`, conservando su mapeo actual.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: el único error restante debe ser el de `AppContext` heredado de la Task 3, más los de `DemoBusinessRepository` por no implementar `getBranches` todavía (lo cierra la Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/interfaces/IBusinessRepository.ts src/repositories/supabase/SupabaseBusinessRepository.ts
git commit -m "feat: repositorio Supabase soporta multiples sucursales y corrige getBranch y saveBranch"
```

---

### Task 5: Modo demo con dos sucursales

**Files:**
- Modify: `src/repositories/demo/DemoStorage.ts:1-10`
- Modify: `src/data/demoSeed.ts:24-33` y `:396-436`
- Modify: `src/repositories/demo/DemoBusinessRepository.ts:20-30, 32-48, 59-81`

**Interfaces:**
- Consumes: `IBusinessRepository` de la Task 4.
- Produces: `demoBranches: Branch[]` (dos sucursales) exportado desde `@/data/demoSeed`; `DEMO_KEYS.BRANCHES`. El export `demoBranch` (singular) se conserva apuntando a la matriz, porque `demoSeed` lo usa internamente para construir zonas y horarios.

- [ ] **Step 1: Cambiar la clave de almacenamiento**

En `src/repositories/demo/DemoStorage.ts`, línea 7, reemplazar:

```ts
  BRANCH: 'nixgo_food_demo_branch',
```

por:

```ts
  BRANCHES: 'nixgo_food_demo_branches',
```

El cambio de nombre de clave es deliberado: los navegadores que ya tengan la clave vieja no la leerán y recibirán la semilla nueva de dos sucursales.

- [ ] **Step 2: Sembrar la segunda sucursal**

En `src/data/demoSeed.ts`, después de `demoBranch` (línea 33), añadir:

```ts
export const demoBranchNorte: Branch = {
  id: 'b0000000-0000-0000-0000-000000000003',
  businessId: 'b0000000-0000-0000-0000-000000000001',
  name: 'El Taca Nijo - Sucursal Norte',
  address: 'Av. Ordóñez Lasso y Los Cerezos, Cuenca, Ecuador',
  latitude: -2.88540,
  longitude: -79.03210,
  phone: '0993334444',
  active: true,
};

export const demoBranches: Branch[] = [demoBranch, demoBranchNorte];
```

- [ ] **Step 3: Sembrar zonas y horarios de la segunda sucursal**

En `demoDeliveryZones` (línea 396), añadir al final del array dos zonas para la sucursal Norte, con tarifas distintas para que la diferencia sea visible en la demo:

```ts
  {
    id: 'zn000000-0000-0000-0000-000000000001',
    businessId: demoBusiness.id,
    branchId: demoBranchNorte.id,
    name: 'Norte - Cercana',
    maxDistanceKm: 2.5,
    fee: 1.75,
    estimatedMinutes: '20-30 min',
    active: true,
  },
  {
    id: 'zn000000-0000-0000-0000-000000000002',
    businessId: demoBusiness.id,
    branchId: demoBranchNorte.id,
    name: 'Norte - Extendida',
    maxDistanceKm: 5.0,
    fee: 2.75,
    estimatedMinutes: '30-40 min',
    active: true,
  },
```

Y reemplazar `demoBusinessHours` (línea 429) para que genere horarios de **ambas** sucursales, con horarios distintos —así se puede comprobar el estado Abierto/Cerrado por sucursal de la Task 9:

```ts
export const demoBusinessHours: BusinessHours[] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    id: `hours_matriz_${dow}`,
    businessId: demoBusiness.id,
    branchId: demoBranch.id,
    dayOfWeek: dow,
    openTime: '09:00:00',
    closeTime: '23:00:00',
    closed: false,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    id: `hours_norte_${dow}`,
    businessId: demoBusiness.id,
    branchId: demoBranchNorte.id,
    dayOfWeek: dow,
    openTime: '11:00:00',
    closeTime: '21:00:00',
    closed: false,
  })),
];
```

Conservar los campos extra que ya tuviera el objeto original si difieren de los mostrados.

- [ ] **Step 4: Adaptar el repositorio demo**

En `DemoBusinessRepository.ts`, reemplazar los métodos estáticos `getBranch`/`saveBranch` (líneas 20-30) por:

```ts
  static async getBranches(): Promise<Branch[]> {
    return DemoStorage.getItem<Branch[]>(DEMO_KEYS.BRANCHES, demoBranches);
  }

  static async getBranch(branchId: string): Promise<Branch | null> {
    const branches = await DemoBusinessRepository.getBranches();
    return branches.find((b) => b.id === branchId) || null;
  }

  static async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    const branches = await DemoBusinessRepository.getBranches();
    if (branch.id) {
      const updated = branches.map((b) => (b.id === branch.id ? { ...b, ...branch } : b));
      DemoStorage.setItem(DEMO_KEYS.BRANCHES, updated);
      DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', updated);
      return updated.find((b) => b.id === branch.id)!;
    }
    const nueva: Branch = {
      id: `br_demo_${Date.now()}`,
      businessId: demoBusiness.id,
      name: branch.name || 'Nueva sucursal',
      address: branch.address || '',
      latitude: branch.latitude ?? demoBranch.latitude,
      longitude: branch.longitude ?? demoBranch.longitude,
      phone: branch.phone || '',
      active: branch.active ?? true,
    };
    const conNueva = [...branches, nueva];
    DemoStorage.setItem(DEMO_KEYS.BRANCHES, conNueva);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', conNueva);
    return nueva;
  }
```

Actualizar el import de la línea 4 para traer `demoBranches` y `demoBranchNorte`.

Añadir el filtro por sucursal en los getters estáticos de zonas y horarios:

```ts
  static async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    const all = DemoStorage.getItem<DeliveryZone[]>(DEMO_KEYS.DELIVERY_ZONES, demoDeliveryZones);
    return branchId ? all.filter((z) => z.branchId === branchId) : all;
  }

  static async getBusinessHours(branchId?: string): Promise<BusinessHours[]> {
    const all = DemoStorage.getItem<BusinessHours[]>(DEMO_KEYS.BUSINESS_HOURS, demoBusinessHours);
    return branchId ? all.filter((h) => h.branchId === branchId) : all;
  }
```

Y actualizar los métodos de instancia del final del archivo (líneas 59-81) para que deleguen con los mismos parámetros, añadiendo `getBranches`:

```ts
  async getBranches(): Promise<Branch[]> {
    return DemoBusinessRepository.getBranches();
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    return DemoBusinessRepository.getBranch(branchId);
  }

  async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    return DemoBusinessRepository.getDeliveryZones(branchId);
  }

  async getBusinessHours(branchId?: string): Promise<BusinessHours[]> {
    return DemoBusinessRepository.getBusinessHours(branchId);
  }
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores en los repositorios demo. Sigue pendiente solo `AppContext` (Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/repositories/demo/ src/data/demoSeed.ts
git commit -m "feat: modo demo con dos sucursales, zonas y horarios propios"
```

---

### Task 6: BranchContext

**Files:**
- Create: `src/context/BranchContext.tsx`
- Modify: `src/app/layout.tsx` (montar el provider con `scope="customer"`)

**Interfaces:**
- Consumes: `getBusinessRepository()` de `@/repositories/factory`; `selectNearestCoveringBranch` y `resolvePersistedBranch` de `@/lib/branchSelection`.
- Produces:
  ```ts
  export interface BranchContextValue {
    branches: Branch[];
    zones: DeliveryZone[];            // todas las zonas del negocio, con branchId
    selectedBranch: Branch | null;
    selectBranch: (branchId: string) => void;
    autoSelectForLocation: (lat: number, lng: number) => BranchCoverage | null;
    loading: boolean;
  }
  export function useBranch(): BranchContextValue;
  export const BranchProvider: React.FC<{ scope: 'customer' | 'admin'; children: React.ReactNode }>;
  ```

- [ ] **Step 1: Crear el provider**

Crear `src/context/BranchContext.tsx`:

```tsx
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
```

- [ ] **Step 2: Montarlo en el layout del cliente**

En `src/app/layout.tsx`, importar `BranchProvider` y envolver el `AppProvider` existente con `<BranchProvider scope="customer">`. El orden importa: `BranchProvider` **por fuera**, porque en la Task 7 `AppProvider` consumirá `useBranch()`.

- [ ] **Step 3: Verificar que compila y arranca**

Run: `npx tsc --noEmit`
Expected: solo el error pendiente de `AppContext`.

Run: `npm run dev` y abrir `http://localhost:3000`
Expected: la home carga con el menú (el provider no debe romper el render aunque aún nadie lo consuma).

- [ ] **Step 4: Commit**

```bash
git add src/context/BranchContext.tsx src/app/layout.tsx
git commit -m "feat: BranchContext carga sucursales y zonas con persistencia por ambito"
```

---

### Task 7: Cliente — cálculo de delivery contra la sucursal elegida

**Files:**
- Modify: `src/context/AppContext.tsx:20` (import), `:72-78` (DEFAULT_LOCATION), `:239-271` (setDeliveryLocation y calculateDelivery)
- Modify: `src/components/LocationPicker.tsx:18, 155-157`

**Interfaces:**
- Consumes: `useBranch()` de la Task 6; `DeliveryService.calculateDeliveryFee(params, zones)` de la Task 3.
- Produces: `AppContext` deja de depender de `activeBranch`. `deliveryFeeResult` pasa a reflejar la sucursal auto-seleccionada.

- [ ] **Step 1: Consumir el contexto de sucursal**

En `src/context/AppContext.tsx`:

- Eliminar `activeBranch` del import de la línea 20 (conservar lo demás que importe de `@/config/business`).
- Dentro de `AppProvider`, añadir al inicio: `const { selectedBranch, autoSelectForLocation, zones } = useBranch();`
- `DEFAULT_LOCATION` (líneas 72-78) ya no puede leer `activeBranch` en el ámbito del módulo. Convertirlo en constante neutra sin coordenadas de sucursal:

```ts
const DEFAULT_LOCATION: DeliveryLocation = {
  latitude: 0,
  longitude: 0,
  address: '',
  locationType: 'Casa',
  hasSelectedLocation: false,
};
```

El estado inicial de `deliveryFeeResult` ya es `isUnselected: true`, así que la interfaz sigue pidiendo al cliente que marque su ubicación antes de cotizar. Comprobar que ningún componente asuma que `DEFAULT_LOCATION` trae las coordenadas de la sucursal: `grep -rn "DEFAULT_LOCATION" src/`.

- [ ] **Step 2: Recalcular contra la sucursal ganadora**

Reemplazar `setDeliveryLocation` y `calculateDelivery` (líneas 239-271) por una versión que primero elige sucursal y luego cotiza con **sus** zonas:

```ts
  const cotizarPara = (lat: number, lng: number): DeliveryQuote => {
    const cobertura = autoSelectForLocation(lat, lng);

    if (!cobertura || !cobertura.zone) {
      return {
        available: false,
        fee: 0,
        reason: 'Ninguna de nuestras sucursales llega a esta dirección. Puedes elegir retiro en local.',
      };
    }

    return DeliveryService.calculateDeliveryFee(
      {
        branchLatitude: cobertura.branch.latitude,
        branchLongitude: cobertura.branch.longitude,
        customerLatitude: lat,
        customerLongitude: lng,
      },
      zones.filter((z) => z.branchId === cobertura.branch.id)
    );
  };

  const setDeliveryLocation = (loc: DeliveryLocation) => {
    const updatedLoc = { ...loc, hasSelectedLocation: true };
    setDeliveryLocationState(updatedLoc);
    setDeliveryFeeResult(cotizarPara(loc.latitude, loc.longitude));
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(updatedLoc));
    } catch (e) {
      console.error(e);
    }
  };

  const calculateDelivery = (lat: number, lng: number): DeliveryQuote => {
    setDeliveryLocationState((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      hasSelectedLocation: true,
    }));
    const quote = cotizarPara(lat, lng);
    setDeliveryFeeResult(quote);
    return quote;
  };
```

- [ ] **Step 3: Mapa centrado en la sucursal elegida**

En `src/components/LocationPicker.tsx`, sustituir el import de `activeBranch` (línea 18) por `useBranch()`, y en las líneas 155-157 pasar los datos de `selectedBranch`, con respaldo a la primera sucursal de la lista mientras no haya ninguna elegida:

```tsx
const { selectedBranch, branches } = useBranch();
const sucursalMapa = selectedBranch || branches[0];
```

```tsx
            branchLat={sucursalMapa.latitude}
            branchLng={sucursalMapa.longitude}
            branchName={sucursalMapa.name}
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: **sin errores**. Aquí se cierra la deuda que dejó la Task 3.

- [ ] **Step 5: Verificar a mano en demo**

Run: `npm run dev`

1. Abrir `http://localhost:3000`, agregar un producto y entrar al checkout.
2. En el paso Entrega, hacer clic cerca del centro de Cuenca → debe cotizar contra la Matriz ($1.50 en la zona cercana).
3. Hacer clic cerca de Av. Ordóñez Lasso (noroeste) → debe cambiar a la Sucursal Norte y cotizar $1.75.
4. Hacer clic muy lejos (fuera de 6 km) → mensaje "Ninguna de nuestras sucursales llega a esta dirección".

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.tsx src/components/LocationPicker.tsx
git commit -m "feat: el delivery se cotiza contra la sucursal mas cercana que cubre la direccion"
```

---

### Task 8: Cliente — mostrar y cambiar la sucursal en el checkout

**Files:**
- Create: `src/components/BranchPicker.tsx`
- Modify: `src/app/checkout/page.tsx:36` (import), `:249` (branchId del payload), `:600-640` (bloque de retiro en local)

**Interfaces:**
- Consumes: `useBranch()`; `evaluateBranchCoverage` de `@/lib/branchSelection`.
- Produces: `<BranchPicker mode="delivery" | "pickup" />`, un componente que lista las sucursales y llama a `selectBranch`.

- [ ] **Step 1: Crear el selector**

Crear `src/components/BranchPicker.tsx`. Lista las sucursales activas; en modo `delivery` muestra la distancia y marca las que no cubren la dirección actual; en modo `pickup` muestra dirección y teléfono. Usa `selectBranch` del contexto al elegir.

```tsx
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
```

- [ ] **Step 2: Enviar la sucursal elegida en el pedido**

En `src/app/checkout/page.tsx`:

- Quitar `activeBranch` del import de la línea 36 y añadir `import { useBranch } from '@/context/BranchContext';`
- Dentro del componente: `const { selectedBranch, branches } = useBranch();`
- En el payload (línea 249), reemplazar `branchId: activeBranch.id` por:

```ts
        branchId: (selectedBranch || branches[0]).id,
```

- Sustituir las demás lecturas de `activeBranch` del archivo (líneas ~610, ~618, ~628 y ~1061 del bloque de retiro y del resumen) por `sucursalActual`, definido junto al hook:

```ts
  const sucursalActual = selectedBranch || branches[0];
```

- [ ] **Step 3: Mostrar quién atiende, con opción de cambiar**

En el paso Entrega (step 2), sobre el bloque del mapa, insertar el resumen de sucursal asignada. En modo retiro, reemplazar el bloque fijo de dirección del local por `<BranchPicker mode="pickup" />`:

```tsx
{deliveryMethod === 'delivery' && selectedBranch && deliveryLocation.hasSelectedLocation && (
  <div className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5">
    <div className="min-w-0">
      <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500 block">
        Te atiende
      </span>
      <span className="font-extrabold text-sm text-white truncate block">{selectedBranch.name}</span>
      {deliveryFeeResult.distanceKm !== undefined && (
        <span className="text-[11px] text-zinc-400">A {deliveryFeeResult.distanceKm} km de tu dirección</span>
      )}
    </div>
    <button
      type="button"
      onClick={() => setMostrarSucursales((v) => !v)}
      className="text-[11px] font-extrabold text-amber-400 hover:text-amber-300 underline shrink-0"
    >
      {mostrarSucursales ? 'Cerrar' : 'Cambiar'}
    </button>
  </div>
)}
{mostrarSucursales && deliveryMethod === 'delivery' && <BranchPicker mode="delivery" />}
```

Declarar el estado junto a los demás del componente: `const [mostrarSucursales, setMostrarSucursales] = useState(false);`

- [ ] **Step 4: Manejar la sucursal desactivada a mitad de compra**

En el `catch` de `handleConfirmOrder` (`checkout/page.tsx`, bloque `catch (err: any)` cercano a la línea 317), antes de asignar `formError`, traducir el error del RPC a una acción concreta:

```ts
      const msg = err?.message || '';
      if (msg.includes('sucursal')) {
        setFormError('La sucursal seleccionada ya no está disponible. Elige otra para continuar.');
        setMostrarSucursales(true);
        setStep(2);
        return;
      }
```

Esto captura el `RAISE EXCEPTION 'La sucursal seleccionada no se encuentra activa.'` que `create_order` ya lanza, en lugar de mostrar el error crudo de Postgres.

- [ ] **Step 5: Verificar a mano**

Run: `npx tsc --noEmit` → sin errores.
Run: `npm run dev`

1. Checkout en modo Delivery con ubicación marcada → aparece "Te atiende: …" y "Cambiar" abre la lista con distancias y tarifas.
2. Cambiar a una sucursal manualmente → el envío del resumen se actualiza.
3. Cambiar a Retiro en local → aparece la lista de sucursales para elegir de cuál retirar.
4. Completar un pedido y confirmar en `/admin/orders` que quedó registrado.

- [ ] **Step 6: Commit**

```bash
git add src/components/BranchPicker.tsx src/app/checkout/page.tsx
git commit -m "feat: el checkout muestra la sucursal asignada y permite cambiarla"
```

---

### Task 9: Cliente — estado Abierto/Cerrado por sucursal

**Files:**
- Modify: `src/components/Header.tsx:18-30`

**Interfaces:**
- Consumes: `useBranch()`; `BusinessHoursService.isRestaurantOpen(hoursList, timezone)` (sin cambios, ya es puro); `getBusinessHours(branchId?)` de la Task 4.
- Produces: ninguna interfaz nueva.

- [ ] **Step 1: Escribir el test de la regla**

Añadir a `src/lib/__tests__/branchSelection.test.ts` un bloque que fije la regla "abierto si alguna sucursal lo está". Primero crear el helper en `src/lib/branchSelection.ts`:

```ts
import { BusinessHours } from '@/types';

/** Horarios de una sucursal concreta. */
export function hoursForBranch(hours: BusinessHours[], branchId: string): BusinessHours[] {
  return hours.filter((h) => h.branchId === branchId);
}
```

Test correspondiente:

```ts
import { hoursForBranch } from '@/lib/branchSelection';

describe('hoursForBranch', () => {
  it('devuelve solo los horarios de la sucursal pedida', () => {
    const hours = [
      { id: 'h1', businessId: 'b', branchId: 'br-matriz', dayOfWeek: 1, openTime: '09:00:00', closeTime: '23:00:00', closed: false },
      { id: 'h2', businessId: 'b', branchId: 'br-norte', dayOfWeek: 1, openTime: '11:00:00', closeTime: '21:00:00', closed: false },
    ];
    expect(hoursForBranch(hours as any, 'br-norte')).toHaveLength(1);
    expect(hoursForBranch(hours as any, 'br-norte')[0].openTime).toBe('11:00:00');
  });
});
```

Añadir `BusinessHours` al import de tipos del archivo de test.

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- branchSelection`
Expected: FAIL — `hoursForBranch` no existe todavía si aún no se añadió.

- [ ] **Step 3: Aplicar la regla en el Header**

En `src/components/Header.tsx`, dentro del `useEffect` que hoy hace `setIsOpenStatus(status.isOpen)` (líneas ~29):

- Traer `const { selectedBranch, branches } = useBranch();`
- Pedir los horarios completos (`getBusinessHours()` sin `branchId`) y decidir:

```tsx
        const todos = await getBusinessRepository().getBusinessHours();
        if (selectedBranch) {
          const status = BusinessHoursService.isRestaurantOpen(
            hoursForBranch(todos, selectedBranch.id),
            timezone
          );
          setIsOpenStatus(status.isOpen);
        } else {
          // Sin sucursal elegida: abierto si alguna lo esta.
          const algunaAbierta = branches.some(
            (b) => BusinessHoursService.isRestaurantOpen(hoursForBranch(todos, b.id), timezone).isOpen
          );
          setIsOpenStatus(algunaAbierta);
        }
```

Añadir `selectedBranch` y `branches` al array de dependencias del `useEffect` para que el badge reaccione al cambiar de sucursal.

Revisar además el `span` de la línea ~69, que hoy escribe "● Abierto" fijo en móvil ignorando el estado; debe usar `isOpenStatus` igual que la versión de escritorio.

- [ ] **Step 4: Verificar**

Run: `npm test -- branchSelection` → PASS.
Run: `npm run dev` → con la semilla demo (Matriz 09:00-23:00, Norte 11:00-21:00), elegir cada sucursal en el checkout y comprobar que el badge del header corresponde al horario de esa sucursal.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branchSelection.ts src/lib/__tests__/branchSelection.test.ts src/components/Header.tsx
git commit -m "fix: el estado abierto/cerrado se calcula por sucursal y no mezcla horarios"
```

---

### Task 10: `getOrders` filtra por sucursal

**Files:**
- Modify: `src/repositories/interfaces/IOrderRepository.ts:22-32`
- Modify: `src/repositories/supabase/SupabaseOrderRepository.ts:8-21`
- Modify: `src/repositories/demo/DemoOrderRepository.ts:201-203` y su estático `getOrders`
- Modify: `src/repositories/OrderRepository.ts:6-8`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `getOrders(businessId?: string, branchId?: string): Promise<Order[]>` en las tres capas. Sin `branchId` el comportamiento es idéntico al actual (todos los pedidos del negocio), para no romper a los consumidores existentes.

- [ ] **Step 1: Ampliar la interfaz y el delegador**

En `IOrderRepository.ts` cambiar la firma a `getOrders(businessId?: string, branchId?: string): Promise<Order[]>`.
En `OrderRepository.ts` (línea 6-8) reenviar ambos parámetros al repositorio activo.

- [ ] **Step 2: Filtrar en la consulta de Supabase**

En `SupabaseOrderRepository.ts`, en `getOrders` (líneas 8-21), tras `.eq('business_id', businessId)` añadir el filtro condicional antes de ejecutar:

```ts
      let query = supabase
        .from('orders')
        .select('*, order_items(*, order_item_modifiers(*))')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
```

Conservar exactamente el `select` que ya usa el archivo; lo mostrado arriba es ilustrativo del encadenado, no del listado de columnas.

- [ ] **Step 3: Filtrar en demo**

En `DemoOrderRepository.getOrders`, aceptar `branchId?` y filtrar en memoria: `return branchId ? all.filter((o) => o.branchId === branchId) : all;`

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sin errores (los consumidores actuales llaman sin el segundo parámetro).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/
git commit -m "feat: getOrders acepta filtro opcional por sucursal"
```

---

### Task 11: Admin — provider y selector de sucursal

**Files:**
- Create: `src/components/admin/BranchSwitcher.tsx`
- Modify: `src/components/admin/AdminLayout.tsx:34-45` (navItems y montaje del provider)

**Interfaces:**
- Consumes: `BranchProvider` y `useBranch()` de la Task 6.
- Produces: `<BranchSwitcher />` montado en la cabecera del admin; el ítem de nav `/admin/branches` (su pantalla llega en la Task 14).

- [ ] **Step 1: Crear el selector**

Crear `src/components/admin/BranchSwitcher.tsx`:

```tsx
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
```

- [ ] **Step 2: Montar el provider y el selector**

En `src/components/admin/AdminLayout.tsx`:

- Envolver el árbol que hoy devuelve `AdminLayout` con `<BranchProvider scope="admin">`, por fuera de `NewOrderAlertProvider`.
- Renderizar `<BranchSwitcher />` en la cabecera, junto a `AudioAlertToggle`.
- Añadir el ítem de navegación después de "Horarios" (línea 43):

```ts
  { href: '/admin/branches', label: 'Sucursales', icon: Store },
```

Importar `Store` desde `lucide-react` en la lista de iconos ya existente.

- [ ] **Step 3: Verificar**

Run: `npm run dev` → entrar a `/admin`, comprobar que el desplegable lista **dos** sucursales en demo, que al cambiar persiste tras recargar (clave `nixgofood_admin_branch` en localStorage) y que "Sucursales" aparece en el menú (aún lleva a 404: la pantalla llega en la Task 14).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/BranchSwitcher.tsx src/components/admin/AdminLayout.tsx
git commit -m "feat: selector de sucursal en el panel admin"
```

---

### Task 12: Admin — filtrar las pantallas operativas y el realtime

**Files:**
- Modify: `src/components/admin/OrdersClientPage.tsx` (carga de pedidos y suscripción)
- Modify: `src/components/admin/KitchenClientPage.tsx` (idem)
- Modify: `src/components/admin/DispatchClientPage.tsx` (idem)
- Modify: `src/components/admin/DashboardClientPage.tsx` (contadores)

**Interfaces:**
- Consumes: `useBranch()`; `getOrders(businessId, branchId)` de la Task 10.
- Produces: ninguna interfaz nueva.

- [ ] **Step 1: Filtrar la carga en las cuatro pantallas**

En cada archivo: añadir `const { selectedBranch } = useBranch();` y pasar `selectedBranch?.id` como segundo argumento de `OrderRepository.getOrders(CURRENT_BUSINESS_ID, selectedBranch?.id)`.

Añadir `selectedBranch?.id` a las dependencias del `useEffect` que dispara la carga, para que cambiar de sucursal recargue la lista.

- [ ] **Step 2: Descartar eventos realtime de otras sucursales**

En cada suscripción de Supabase Realtime (y en el handler de `DemoBroadcastService` equivalente), descartar el evento cuando el pedido no pertenece a la sucursal en pantalla. Insertar el guardia al principio del callback, **antes** de tocar estado o de disparar sonido:

```ts
        const branchIdEvento = payload.new?.branch_id ?? payload.old?.branch_id;
        if (selectedBranch && branchIdEvento && branchIdEvento !== selectedBranch.id) return;
```

Esto es lo que evita que una comanda del local B suene y aparezca en la cocina del local A. Revisar también `checkAndNotifyNewPendingTransfer` en `OrdersClientPage.tsx:120-136`, que recibe el payload crudo y dispara la campana: debe quedar detrás del mismo guardia.

- [ ] **Step 3: Verificar el aislamiento**

Run: `npm run dev`

1. En `/admin/orders` con la Matriz seleccionada, anotar cuántos pedidos hay.
2. Cambiar a Sucursal Norte → la lista debe quedar vacía (la semilla demo solo trae pedidos de la matriz).
3. Crear un pedido nuevo desde el menú del cliente eligiendo la **Sucursal Norte**.
4. Con el admin en Matriz: **no** debe sonar la campana ni aparecer la comanda. Cambiar a Norte → debe estar ahí.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/
git commit -m "feat: cocina, despacho, caja y resumen se filtran por sucursal incluido el realtime"
```

---

### Task 13: Admin — Delivery y Horarios sobre la sucursal seleccionada

**Files:**
- Modify: `src/components/admin/DeliveryClientPage.tsx:8, 147, 169, 248-250`
- Modify: `src/components/admin/HoursClientPage.tsx:8, 74, 121`

**Interfaces:**
- Consumes: `useBranch()`; `getDeliveryZones(branchId)` y `getBusinessHours(branchId)` de la Task 4.
- Produces: ninguna interfaz nueva.

- [ ] **Step 1: Sustituir la sucursal fija**

En ambos archivos, quitar `activeBranch` del import (línea 8), añadir `const { selectedBranch } = useBranch();` y reemplazar cada `activeBranch.id` por `selectedBranch.id`. Cargar los datos con el filtro por sucursal (`getDeliveryZones(selectedBranch.id)`, `getBusinessHours(selectedBranch.id)`) y añadir `selectedBranch?.id` a las dependencias de los efectos de carga.

En `DeliveryClientPage.tsx:248-250`, la cabecera "Origen del Delivery" debe mostrar el nombre, dirección y coordenadas de `selectedBranch`.

- [ ] **Step 2: Proteger el render sin sucursal**

Mientras `selectedBranch` sea `null` (carga inicial), devolver el estado de carga existente de cada pantalla en vez de intentar leer `.id` de null.

- [ ] **Step 3: Verificar**

Run: `npm run dev`

1. En `/admin/delivery` con Matriz → deben verse 3 zonas (1.50 / 2.00 / 2.50).
2. Cambiar a Norte → deben verse 2 zonas (1.75 / 2.75).
3. En `/admin/hours`, Matriz muestra 09:00-23:00 y Norte 11:00-21:00.
4. Editar el horario de Norte y guardar → recargar y comprobar que **solo** cambió Norte.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DeliveryClientPage.tsx src/components/admin/HoursClientPage.tsx
git commit -m "feat: delivery y horarios se editan sobre la sucursal seleccionada"
```

---

### Task 14: Admin — pantalla de sucursales

**Files:**
- Create: `src/app/admin/branches/page.tsx`
- Create: `src/components/admin/BranchesClientPage.tsx`

**Interfaces:**
- Consumes: `getBusinessRepository().getBranches()` y `.saveBranch(branch)` de las tareas 4 y 5; `useBranch()`.
- Produces: la ruta `/admin/branches`, ya enlazada en el nav por la Task 11.

- [ ] **Step 1: Crear el wrapper de servidor**

Crear `src/app/admin/branches/page.tsx` siguiendo el patrón exacto de `src/app/admin/hours/page.tsx` (Server Component con `export const dynamic = 'force-dynamic'` que renderiza el ClientPage). Copiar ese archivo y cambiar el componente importado.

- [ ] **Step 2: Crear la pantalla**

Crear `src/components/admin/BranchesClientPage.tsx` con:

- Listado de sucursales en tarjetas: nombre, dirección, teléfono, coordenadas y badge Activa/Inactiva.
- Botón "Nueva sucursal" que abre el formulario vacío.
- Formulario con: nombre (requerido), dirección (requerido), teléfono, latitud y longitud (numéricos, requeridos) y un interruptor Activa/Inactiva.
- Guardado vía `getBusinessRepository().saveBranch({...})` — sin `id` crea, con `id` actualiza.
- Tras guardar, recargar la lista.

Validación mínima antes de guardar, mostrando el error en pantalla y sin llamar al repositorio:

```ts
    if (!nombre.trim() || !direccion.trim()) {
      setError('El nombre y la dirección son obligatorios.');
      return;
    }
    if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
      setError('Las coordenadas deben ser números válidos.');
      return;
    }
```

**No incluir botón de borrado.** Para retirar una sucursal se usa el interruptor Activa/Inactiva; los pedidos la referencian por clave foránea y borrarla rompería el historial. Junto al interruptor, mostrar la nota: *"Una sucursal inactiva deja de aparecer para los clientes, pero se conserva en el historial de pedidos."*

Para elegir coordenadas, reutilizar el mapa existente: `DeliveryClientPage` y `LocationPicker` ya montan Leaflet en este proyecto — seguir el mismo patrón de importación dinámica con `ssr: false` que usen esos archivos, porque Leaflet no puede renderizarse en servidor.

- [ ] **Step 3: Verificar**

Run: `npm run dev`

1. Entrar a `/admin/branches` → se ven las dos sucursales demo.
2. Crear una tercera con coordenadas de Cuenca → aparece en la lista **y** en el selector de la cabecera.
3. Editar su nombre → se refleja en el selector.
4. Desactivarla → desaparece del selector del admin y del `BranchPicker` del cliente.
5. Confirmar que no existe ningún botón de borrado.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/branches/ src/components/admin/BranchesClientPage.tsx
git commit -m "feat: pantalla de alta y edicion de sucursales en el admin"
```

---

### Task 15: Limpiar Configuración Negocio

**Files:**
- Modify: `src/components/admin/SettingsBusinessClientPage.tsx:8, 21-25, 144-147, 158-160, 185-203`
- Modify: `src/config/business.ts:39-48` (comentario)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `activeBranch` queda documentada como fallback y deja de mutarse en memoria.

- [ ] **Step 1: Quitar los campos de sucursal**

En `SettingsBusinessClientPage.tsx`, eliminar del formulario los campos de dirección y coordenadas de la sucursal, el estado asociado (`latitude`, `longitude`, `branchAddress`, `branchId`) y la llamada a `saveBranch`. La pantalla queda con lo que es del negocio: nombre, descripción, teléfonos, moneda, colores y datos de pago.

Añadir en su lugar un enlace a la pantalla nueva:

```tsx
<Link href="/admin/branches" className="text-xs font-extrabold text-amber-400 hover:text-amber-300 underline">
  Gestionar sucursales →
</Link>
```

- [ ] **Step 2: Eliminar la mutación de la constante**

Borrar las seis asignaciones que mutan el módulo en memoria (líneas 145-147, 158-160 y 201-203):

```ts
activeBranch.latitude = latitude;
activeBranch.longitude = longitude;
activeBranch.address = branchAddress;
```

Ya no hacen falta: `BranchContext` recarga desde el repositorio.

- [ ] **Step 3: Documentar el nuevo papel de la constante**

En `src/config/business.ts`, sobre `activeBranch`, añadir:

```ts
/**
 * Sucursal de respaldo. NO es la fuente de verdad: las sucursales se leen con
 * getBusinessRepository().getBranches() a traves de BranchContext.
 * Solo se usa como fallback si la base de datos no responde.
 */
```

- [ ] **Step 4: Verificar que no queda nadie leyendo la constante**

Run: `grep -rn "activeBranch" src/ --include=*.ts --include=*.tsx`
Expected: solo `src/config/business.ts` (definición), `BranchContext.tsx` (fallback) y `SupabaseBusinessRepository.ts` (fallback). Cualquier otra aparición es una migración incompleta de las tareas anteriores.

Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SettingsBusinessClientPage.tsx src/config/business.ts
git commit -m "refactor: configuracion del negocio deja de editar la sucursal y de mutar la constante"
```

---

### Task 16: RLS de `branches` en producción

**Files:**
- Modify: `supabase/scripts/master_setup.sql` (bloque de políticas, tras la línea ~348)

**Interfaces:**
- Consumes: nada.
- Produces: políticas RLS sobre `branches`. **Requiere un paso manual del usuario**: ejecutar el script en el editor SQL de Supabase.

- [ ] **Step 1: Añadir las políticas**

En `supabase/scripts/master_setup.sql`, dentro del bloque de políticas RLS (junto a las de `orders`), añadir:

```sql
-- RLS PARA BRANCHES (multi-sucursal)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active branches" ON branches;
CREATE POLICY "Public read active branches" ON branches
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Authenticated read all branches" ON branches;
CREATE POLICY "Authenticated read all branches" ON branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage branches" ON branches;
CREATE POLICY "Authenticated manage branches" ON branches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON branches TO public, anon, authenticated;
GRANT INSERT, UPDATE ON branches TO authenticated;
```

El cliente anónimo solo lee sucursales activas; escribir exige sesión autenticada. La política de lectura para `authenticated` es necesaria para que el admin vea también las inactivas en `/admin/branches`.

- [ ] **Step 2: Verificar el script antes de entregarlo**

Run: `grep -n "z0000000" supabase/scripts/master_setup.sql`
Expected: sin resultados. (Los UUID con `z` no son hexadecimales válidos y Postgres los rechaza — ya ocurrió una vez en este proyecto.)

- [ ] **Step 3: Pedir al usuario que lo ejecute**

Este paso **no lo puede hacer el agente**: requiere las credenciales del proyecto Supabase. Entregar al usuario esta instrucción:

> Abre el editor SQL de tu proyecto Supabase de producción y ejecuta el contenido actualizado de `supabase/scripts/master_setup.sql` (es idempotente). Sin esto, la pantalla de sucursales no podrá escribir en producción.

Esperar confirmación antes de dar la tarea por terminada.

- [ ] **Step 4: Verificar en producción tras la ejecución**

Con `NEXT_PUBLIC_DEMO_MODE=false`, entrar a `/admin/branches`, crear una sucursal de prueba y comprobar que se guarda. Luego desactivarla para no dejarla visible a clientes.

- [ ] **Step 5: Commit**

```bash
git add supabase/scripts/master_setup.sql
git commit -m "feat: politicas RLS para la tabla branches"
```

---

## Verificación final

- [ ] **Suite completa**

Run: `npm test`
Expected: PASS, incluidos los tests de `branchSelection` y `deliveryService`.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Recorrido funcional en modo demo**

1. Cliente: pedir a la Matriz y a la Norte, comprobando que la tarifa cambia según la sucursal asignada.
2. Cliente: dirección fuera de cobertura → mensaje claro y opción de retiro.
3. Cliente: retiro en local → se puede elegir sucursal.
4. Admin: cambiar de sucursal aísla Cocina, Despacho, Caja y Resumen.
5. Admin: un pedido de una sucursal no dispara alerta en la otra.
6. Admin: crear, editar y desactivar una sucursal.

- [ ] **Regresión de lo ya existente**

7. La agrupación por día de la pestaña "Entregados" sigue funcionando (feature del 2026-08-19).
8. El resto de pestañas de Caja siguen mostrando la grilla plana.
9. Productos, Categorías y Modificadores **no** se ven afectados por el cambio de sucursal.
