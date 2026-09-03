import { EscalonDeCarga } from '@/lib/demoraPorCarga';

/**
 * Avisos sobre la tabla de escalones, para mostrarle al restaurante
 * mientras la edita.
 *
 * Son avisos, no errores que bloqueen: el calculo tolera una tabla
 * imperfecta (ante un hueco usa el escalon inferior mas cercano). Pero
 * un hueco casi siempre es un error de carga, y es mejor decirlo antes
 * de que un cliente vea un tiempo que nadie quiso configurar.
 */
export function validarEscalones(escalones: EscalonDeCarga[]): string[] {
  if (escalones.length === 0) return [];

  const avisos: string[] = [];
  const ordenados = [...escalones].sort((a, b) => a.desdeItems - b.desdeItems);

  for (const escalon of ordenados) {
    if (escalon.desdeItems < 0 || escalon.minutosExtra < 0 || (escalon.hastaItems ?? 0) < 0) {
      avisos.push('Hay valores negativos: las cantidades y los minutos no pueden serlo.');
      break;
    }
  }

  for (const escalon of ordenados) {
    if (escalon.hastaItems !== null && escalon.hastaItems < escalon.desdeItems) {
      avisos.push(
        `El tramo ${escalon.desdeItems} → ${escalon.hastaItems} está invertido: el "desde" es mayor que el "hasta".`
      );
    }
  }

  const sinTope = ordenados.filter((e) => e.hastaItems === null);
  if (sinTope.length > 1) {
    avisos.push('Hay más de un tramo sin tope. Solo el último puede quedar abierto.');
  }

  for (let i = 0; i < ordenados.length - 1; i++) {
    const actual = ordenados[i];
    const siguiente = ordenados[i + 1];

    if (actual.hastaItems === null) continue;

    if (siguiente.desdeItems <= actual.hastaItems) {
      avisos.push(
        `Los tramos se pisan: uno llega hasta ${actual.hastaItems} y el siguiente ya empieza en ${siguiente.desdeItems}.`
      );
    } else if (siguiente.desdeItems > actual.hastaItems + 1) {
      avisos.push(
        `Queda un hueco sin cubrir entre ${actual.hastaItems + 1} y ${siguiente.desdeItems - 1} ítems.`
      );
    }
  }

  // Sin un tramo abierto al final, una cocina mas cargada que el maximo
  // configurado no tendria escalon propio.
  const ultimo = ordenados[ordenados.length - 1];
  if (ultimo.hastaItems !== null) {
    avisos.push(
      `A partir de ${ultimo.hastaItems + 1} ítems no hay tramo configurado. Dejá el último sin tope para cubrirlo.`
    );
  }

  return avisos;
}
