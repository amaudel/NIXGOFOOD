export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * (0, 0) es el valor inicial de DeliveryLocation, no una direccion: cae en el
 * Golfo de Guinea. Tratarlo como un punto real hacia que el mapa del checkout
 * abriera en medio del oceano, con el pin del cliente y el marcador de la
 * sucursal fuera de pantalla.
 */
function esPuntoUsable({ latitude, longitude }: LatLng): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude !== 0 || longitude !== 0;
}

/**
 * Centro inicial del mapa de entrega: el punto del cliente solo cuando de
 * verdad eligio uno; si no, la sucursal que lo atiende, que es el mejor
 * encuadre para que reconozca su barrio y marque su casa.
 */
export function resolveMapCenter(
  customer: LatLng,
  branch: LatLng,
  hasSelectedLocation: boolean
): LatLng {
  return hasSelectedLocation && esPuntoUsable(customer) ? customer : branch;
}

/**
 * Si el pin arrastrable del cliente debe dibujarse. Sin punto elegido no se
 * dibuja: un pin plantado en (0, 0) le dice al cliente que ya marco algo.
 */
export function shouldShowCustomerPin(
  customer: LatLng,
  hasSelectedLocation: boolean
): boolean {
  return hasSelectedLocation && esPuntoUsable(customer);
}
