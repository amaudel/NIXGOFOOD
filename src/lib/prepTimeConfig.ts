import { ConfiguracionDemora, EscalonDeCarga } from '@/lib/demoraPorCarga';

/**
 * Rango de retiro que se usa cuando la sucursal no tiene uno cargado.
 * Es el mismo valor que estaba escrito a mano en el checkout, para que
 * los negocios que ya operaban no cambien de comportamiento.
 */
export const RETIRO_POR_DEFECTO = { min: 15, max: 25 } as const;

const TECHO_POR_DEFECTO = 30;

/** Columnas de `branches` que importan para esto. */
export interface FilaSucursalDemora {
  auto_delay_enabled?: boolean | null;
  manual_extra_minutes?: number | null;
  manual_extra_until?: string | null;
  max_extra_minutes?: number | null;
}

/** Filas de `prep_time_tiers`. */
export interface FilaEscalon {
  from_items: number;
  to_items: number | null;
  extra_minutes: number;
  active?: boolean | null;
}

export function mapearConfiguracionDemora(
  sucursal: FilaSucursalDemora | null,
  escalones: FilaEscalon[],
  ahora: Date = new Date()
): ConfiguracionDemora {
  const activos: EscalonDeCarga[] = (escalones || [])
    .filter((e) => e.active !== false)
    .map((e) => ({
      desdeItems: e.from_items,
      hastaItems: e.to_items ?? null,
      minutosExtra: e.extra_minutes,
    }));

  // El freno manual se apaga solo: sin esto, un "estamos a full" que
  // nadie recuerda desactivar deja los tiempos inflados para siempre.
  const hasta = sucursal?.manual_extra_until;
  const frenoVencido = hasta ? new Date(hasta).getTime() <= ahora.getTime() : false;

  return {
    escalones: activos,
    automaticoActivo: sucursal?.auto_delay_enabled ?? true,
    minutosManuales: frenoVencido ? 0 : sucursal?.manual_extra_minutes ?? 0,
    techoMinutos: sucursal?.max_extra_minutes ?? TECHO_POR_DEFECTO,
  };
}

/**
 * Texto del rango de preparacion que ve el cliente, con el extra ya
 * aplicado. Usa el mismo formato que las zonas de delivery ("20-30 min"),
 * que es el que ya viaja en orders.estimated_minutes.
 */
export function formatearRangoPreparacion(
  minMinutos: number | null | undefined,
  maxMinutos: number | null | undefined,
  minutosExtra: number
): string {
  const base = {
    min: minMinutos ?? RETIRO_POR_DEFECTO.min,
    max: maxMinutos ?? RETIRO_POR_DEFECTO.max,
  };

  const min = Math.max(0, base.min + minutosExtra);
  const max = Math.max(min, base.max + minutosExtra);

  return `${min}-${max} min`;
}
