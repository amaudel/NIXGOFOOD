/**
 * Formatea el par lat/lng de una sucursal para mostrarlo en el panel.
 *
 * Devuelve null -- y no un texto a medias -- cuando la ubicacion todavia
 * no esta cargada, para que quien llama pueda omitir la linea entera en
 * vez de imprimir "Coordenadas: ,". Postgres entrega NUMERIC como texto,
 * asi que tambien acepta strings.
 */
export function formatCoordenadas(
  latitud: number | string | null | undefined,
  longitud: number | string | null | undefined
): string | null {
  const lat = typeof latitud === 'string' ? parseFloat(latitud) : latitud;
  const lng = typeof longitud === 'string' ? parseFloat(longitud) : longitud;

  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;

  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
