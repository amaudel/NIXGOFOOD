import { Branch, DeliveryZone, DeliveryQuote } from '@/types';
import { DeliveryService } from '@/services/DeliveryService';
import { selectNearestCoveringBranch } from '@/lib/branchSelection';

export interface ResolveDeliveryQuoteParams {
  lat: number;
  lng: number;
  branches: Branch[];
  zones: DeliveryZone[];
  /** Sucursal que el cliente eligio a mano (BranchPicker), o null si nunca eligio una. */
  manuallySelectedBranch: Branch | null;
}

export interface ResolvedDeliveryQuote {
  quote: DeliveryQuote;
  /** Sucursal contra la que quedo cotizado el pedido, o null si ninguna cubre el punto. */
  branch: Branch | null;
}

function cotizarContraSucursal(
  branch: Branch,
  zones: DeliveryZone[],
  lat: number,
  lng: number
): DeliveryQuote {
  return DeliveryService.calculateDeliveryFee(
    {
      branchLatitude: branch.latitude,
      branchLongitude: branch.longitude,
      customerLatitude: lat,
      customerLongitude: lng,
    },
    zones.filter((z) => z.branchId === branch.id)
  );
}

/**
 * Decide contra que sucursal cotizar un punto de entrega, respetando una
 * eleccion manual del cliente mientras siga siendo valida.
 *
 * Antes, cualquier cambio de posicion (mover el pin, recargar la pagina con
 * la ubicacion ya guardada) volvia a auto-seleccionar la sucursal mas
 * cercana sin importar que el cliente ya hubiera elegido otra a mano desde
 * BranchPicker -- "Mueve el pin hasta la entrada exacta de tu domicilio" es
 * justo la interaccion que la propia UI invita a hacer despues de elegir
 * sucursal, asi que revertir ahi era el caso comun, no uno raro.
 *
 * Aqui la sucursal elegida a mano gana siempre que su propia zona siga
 * cubriendo el punto nuevo; si ya no lo cubre (el cliente se movio a otro
 * sector de la ciudad), recien ahi se cae a la mas cercana que si cubra.
 */
export function resolveDeliveryQuote({
  lat,
  lng,
  branches,
  zones,
  manuallySelectedBranch,
}: ResolveDeliveryQuoteParams): ResolvedDeliveryQuote {
  if (manuallySelectedBranch) {
    const quote = cotizarContraSucursal(manuallySelectedBranch, zones, lat, lng);
    if (quote.available) {
      return { quote, branch: manuallySelectedBranch };
    }
  }

  const cobertura = selectNearestCoveringBranch(branches, zones, lat, lng);
  if (!cobertura || !cobertura.zone) {
    return {
      quote: {
        available: false,
        fee: 0,
        reason: 'Ninguna de nuestras sucursales llega a esta dirección. Puedes elegir retiro en local.',
      },
      branch: null,
    };
  }

  return {
    quote: cotizarContraSucursal(cobertura.branch, zones, lat, lng),
    branch: cobertura.branch,
  };
}
