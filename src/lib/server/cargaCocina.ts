import { createClient } from '@/lib/supabase/server';
import { calcularMinutosExtra } from '@/lib/demoraPorCarga';
import {
  mapearConfiguracionDemora,
  formatearRangoPreparacion,
  FilaEscalon,
  RETIRO_POR_DEFECTO,
} from '@/lib/prepTimeConfig';
import { crearCacheTTL } from '@/lib/cacheTTL';
import { ESTADOS_PENDIENTES, VENTANA_HORAS } from '@/lib/cargaPendiente';

/**
 * Carga de cocina y demora resultante de UNA sucursal.
 *
 * Server-only a proposito: la tabla `orders` esta protegida por RLS y
 * `anon` no puede leerla. El conteo se hace aca con la clave de servicio
 * y hacia afuera sale unicamente un numero de minutos, nunca datos de
 * pedidos.
 */

export interface DemoraDeSucursal {
  itemsPendientes: number;
  minutosExtra: number;
  /** Rango de retiro en local, con el extra ya aplicado. */
  rangoRetiro: string;
}

const SIN_DEMORA: DemoraDeSucursal = {
  itemsPendientes: 0,
  minutosExtra: 0,
  rangoRetiro: `${RETIRO_POR_DEFECTO.min}-${RETIRO_POR_DEFECTO.max} min`,
};

async function contarItemsPendientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string
): Promise<number> {
  const desde = new Date(Date.now() - VENTANA_HORAS * 60 * 60 * 1000).toISOString();

  const { data: pedidos } = await supabase
    .from('orders')
    .select('id')
    .eq('branch_id', branchId)
    .in('status', ESTADOS_PENDIENTES)
    .gte('created_at', desde);

  if (!pedidos || pedidos.length === 0) return 0;

  const { data: items } = await supabase
    .from('order_items')
    .select('quantity')
    .in('order_id', pedidos.map((p: { id: string }) => p.id));

  return (items || []).reduce(
    (total: number, item: { quantity: number }) => total + (item.quantity || 0),
    0
  );
}

// La clave del cache trae los dos ids: la sucursal se valida siempre
// contra el negocio del dominio, para que un tenant no pueda consultar la
// carga de otro pasando un branchId ajeno.
function armarClave(businessId: string, branchId: string): string {
  return `${businessId}|${branchId}`;
}

async function calcularDemora(clave: string): Promise<DemoraDeSucursal> {
  const [businessId, branchId] = clave.split('|');
  const supabase = await createClient();

  const [sucursalRes, escalonesRes, itemsPendientes] = await Promise.all([
    supabase
      .from('branches')
      .select(
        'pickup_prep_min_minutes, pickup_prep_max_minutes, auto_delay_enabled, manual_extra_minutes, manual_extra_until, max_extra_minutes'
      )
      .eq('id', branchId)
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('prep_time_tiers')
      .select('from_items, to_items, extra_minutes, active')
      .eq('branch_id', branchId)
      .eq('business_id', businessId),
    contarItemsPendientes(supabase, branchId),
  ]);

  const sucursal = sucursalRes.data;
  const config = mapearConfiguracionDemora(
    sucursal,
    (escalonesRes.data || []) as FilaEscalon[]
  );

  const minutosExtra = calcularMinutosExtra(itemsPendientes, config);

  return {
    itemsPendientes,
    minutosExtra,
    rangoRetiro: formatearRangoPreparacion(
      sucursal?.pickup_prep_min_minutes,
      sucursal?.pickup_prep_max_minutes,
      minutosExtra
    ),
  };
}

// Cache corto: el menu es publico y no puede consultar la base en cada
// visita. 30 s de desfasaje en un numero de minutos es irrelevante.
const demoraCacheada = crearCacheTTL(calcularDemora, 30_000);

/**
 * Nunca lanza. Si la base falla o tarda, devuelve "sin demora" y el
 * cliente ve el tiempo base: un menu que no carga por calcular una
 * demora seria peor que la demora misma.
 */
export async function obtenerDemoraDeSucursal(
  businessId: string | null | undefined,
  branchId: string | null | undefined
): Promise<DemoraDeSucursal> {
  if (!businessId || !branchId) return SIN_DEMORA;

  try {
    return await demoraCacheada(armarClave(businessId, branchId));
  } catch (error) {
    console.error('cargaCocina: no se pudo calcular la demora, se sigue sin extra', error);
    return SIN_DEMORA;
  }
}
