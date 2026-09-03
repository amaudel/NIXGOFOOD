/**
 * Lee una variable de entorno recortando los espacios de los extremos, y
 * tratando "solo espacios" como ausente.
 *
 * Un valor pegado en el panel de Vercel puede arrastrar un espacio
 * invisible; concatenarlo en una URL produce peticiones invalidas que
 * fallan en cada request sin que el valor se vea mal en el panel. Acepta
 * varios nombres para los casos con variable alternativa, y devuelve el
 * primero que tenga contenido real.
 */
export function leerEnv(...nombres: string[]): string | undefined {
  for (const nombre of nombres) {
    const valor = process.env[nombre]?.trim();
    if (valor) return valor;
  }
  return undefined;
}
