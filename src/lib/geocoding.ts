export interface ReverseGeocodeResult {
  display_name?: string;
  address?: Record<string, string | undefined>;
}

function limpio(valor?: string): string {
  return (valor || '').trim();
}

/**
 * Convierte una respuesta de geocodificacion inversa en la direccion corta
 * que le sirve a un repartidor: calle, numero y barrio. La ciudad y el pais
 * se omiten a proposito -- el pedido ya pertenece a una sucursal, repetirlos
 * solo alarga un campo que el cliente todavia puede corregir a mano.
 *
 * Devuelve null cuando no hay nada aprovechable, para que quien llama deje
 * el campo vacio en vez de escribir coordenadas crudas: la validacion del
 * checkout se encarga entonces de pedirle la direccion al cliente.
 */
export function formatReverseGeocodedAddress(
  raw: ReverseGeocodeResult | null | undefined
): string | null {
  if (!raw) return null;

  const address = raw.address || {};
  const calle = limpio(address.road) || limpio(address.pedestrian) || limpio(address.footway);

  if (calle) {
    const numero = limpio(address.house_number);
    const barrio = limpio(address.neighbourhood) || limpio(address.suburb);

    const conNumero = numero ? `${calle} ${numero}` : calle;
    // Nominatim a veces repite el mismo nombre en road y neighbourhood.
    return barrio && barrio !== calle ? `${conNumero}, ${barrio}` : conNumero;
  }

  // Sin calle, las dos primeras partes del display_name son el lugar y su
  // sector; el resto es ciudad, provincia y pais.
  const partes = limpio(raw.display_name)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (partes.length === 0) return null;

  return partes.slice(0, 2).join(', ');
}
