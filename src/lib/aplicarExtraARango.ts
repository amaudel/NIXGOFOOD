/**
 * Suma la demora de cocina a un tiempo estimado que ya viene como texto
 * (los de las zonas de delivery: "20-30 min").
 *
 * Ante cualquier formato que no reconozca devuelve el texto original:
 * mostrar el tiempo sin el extra es preferible a mostrar algo mal
 * calculado o roto.
 */
const RANGO = /^\s*(\d+)\s*-\s*(\d+)\s*min\s*$/i;
const UNICO = /^\s*(\d+)\s*min\s*$/i;

export function aplicarExtraARango(
  textoOriginal: string | null | undefined,
  minutosExtra: number
): string {
  const texto = textoOriginal ?? '';
  if (!texto || minutosExtra <= 0) return texto;

  const rango = texto.match(RANGO);
  if (rango) {
    return `${Number(rango[1]) + minutosExtra}-${Number(rango[2]) + minutosExtra} min`;
  }

  const unico = texto.match(UNICO);
  if (unico) {
    return `${Number(unico[1]) + minutosExtra} min`;
  }

  return texto;
}
