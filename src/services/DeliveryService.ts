import { DeliveryQuote, DeliveryCalculationParams, DeliveryZone } from '@/types';
import { activeBranch, CURRENT_BUSINESS_ID } from '@/config/business';

export const deliveryZones: DeliveryZone[] = [
  {
    id: 'zone-1',
    businessId: CURRENT_BUSINESS_ID,
    name: 'Zona 1',
    maxDistanceKm: 2.0,
    fee: 1.50,
    estimatedMinutes: '20-30 min',
  },
  {
    id: 'zone-2',
    businessId: CURRENT_BUSINESS_ID,
    name: 'Zona 2',
    maxDistanceKm: 4.0,
    fee: 2.00,
    estimatedMinutes: '25-35 min',
  },
  {
    id: 'zone-3',
    businessId: CURRENT_BUSINESS_ID,
    name: 'Zona 3',
    maxDistanceKm: 6.0,
    fee: 2.50,
    estimatedMinutes: '35-45 min',
  },
];

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
   * Calculates delivery quote based on branch and customer coordinates.
   * Decoupled architecture allowing future migration to polygon geofencing.
   */
  static calculateDeliveryFee(
    paramsOrLat: DeliveryCalculationParams | number,
    maybeLng?: number
  ): DeliveryQuote {
    let branchLat: number;
    let branchLng: number;
    let custLat: number;
    let custLng: number;

    if (typeof paramsOrLat === 'object') {
      branchLat = paramsOrLat.branchLatitude;
      branchLng = paramsOrLat.branchLongitude;
      custLat = paramsOrLat.customerLatitude;
      custLng = paramsOrLat.customerLongitude;
    } else {
      branchLat = activeBranch.latitude;
      branchLng = activeBranch.longitude;
      custLat = paramsOrLat;
      custLng = maybeLng ?? activeBranch.longitude;
    }

    const distanceKm = calculateDistanceKm(branchLat, branchLng, custLat, custLng);

    // Sort zones by maxDistanceKm ascending to find the smallest matching zone
    const sortedZones = [...deliveryZones].sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
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

    // Out of delivery coverage (> 6.0 km)
    return {
      available: false,
      fee: 0,
      distanceKm,
      reason: 'Esta ubicación está fuera de nuestra zona de delivery (máximo 6.0 km).',
    };
  }
}
