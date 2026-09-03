/**
 * Cuantos minutos extra sumarle al tiempo estimado segun la carga de la
 * cocina. Ver docs/superpowers/specs/2026-09-03-tiempos-preparacion-dinamicos-design.md
 *
 * Pura a proposito: la consulta a la base, el cache y la UI pueden
 * cambiar, pero la regla de negocio vive y se prueba aca.
 */

export interface EscalonDeCarga {
  /** Cantidad de items desde la que aplica, inclusive. */
  desdeItems: number;
  /** Hasta que cantidad aplica, inclusive. null = sin tope. */
  hastaItems: number | null;
  minutosExtra: number;
}

export interface ConfiguracionDemora {
  escalones: EscalonDeCarga[];
  automaticoActivo: boolean;
  /** Freno manual del restaurante. 0 = apagado. */
  minutosManuales: number;
  /** Tope duro para no mostrarle tiempos absurdos al cliente. 0 = sin tope. */
  techoMinutos: number;
}

function extraAutomatico(itemsPendientes: number, escalones: EscalonDeCarga[]): number {
  // Se ordena aca y no se asume el orden de entrada: los escalones
  // llegan de la base o del panel, donde nadie garantiza el orden.
  const ordenados = [...escalones].sort((a, b) => a.desdeItems - b.desdeItems);

  let aplicable: EscalonDeCarga | undefined;
  for (const escalon of ordenados) {
    if (escalon.desdeItems > itemsPendientes) break;
    // Un escalon que ya quedo atras igual sirve de respaldo: si la
    // tabla tiene un hueco, vale el inferior mas cercano en vez de
    // dejar al cliente sin tiempo calculado.
    aplicable = escalon;
  }

  // hastaItems no se consulta a proposito: el escalon encontrado es el
  // inferior mas cercano, y esa es justamente la regla para los huecos.
  // Solo importa para validar la tabla cuando se guarda en el panel.
  return aplicable?.minutosExtra ?? 0;
}

export function calcularMinutosExtra(
  itemsPendientes: number,
  config: ConfiguracionDemora
): number {
  const carga = Math.max(0, itemsPendientes);

  const automatico = config.automaticoActivo ? extraAutomatico(carga, config.escalones) : 0;
  const manual = Math.max(0, config.minutosManuales);

  // El mayor de los dos, nunca la suma: si el sistema calcula +20 y el
  // dueno puso +10, sumarlos daria +30, que no es lo que nadie espera.
  const extra = Math.max(automatico, manual);

  if (config.techoMinutos > 0) return Math.min(extra, config.techoMinutos);
  return extra;
}
