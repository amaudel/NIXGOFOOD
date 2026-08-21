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
