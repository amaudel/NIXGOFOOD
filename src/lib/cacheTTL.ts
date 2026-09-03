/**
 * Cache en memoria con vencimiento, por clave.
 *
 * No usa `use cache` de Next 16 porque esa directiva exige activar
 * cacheComponents en next.config, lo que cambia la semantica de cache de
 * toda la app; y unstable_cache quedo deprecado en esta version. Para lo
 * que se necesita aca -- un numero de minutos con TTL de segundos -- que
 * cada instancia tenga su propia copia es irrelevante.
 */

interface Entrada<T> {
  valor: T;
  venceEn: number;
}

export function crearCacheTTL<T>(
  calcular: (clave: string) => Promise<T>,
  ttlMs: number
): (clave: string) => Promise<T> {
  const listos = new Map<string, Entrada<T>>();
  // Consultas en vuelo: sin esto, N visitas simultaneas con el cache
  // vencido disparan N consultas identicas a la base.
  const enCurso = new Map<string, Promise<T>>();

  return async function obtener(clave: string): Promise<T> {
    const guardado = listos.get(clave);
    if (guardado && guardado.venceEn > Date.now()) return guardado.valor;

    const yaPedido = enCurso.get(clave);
    if (yaPedido) return yaPedido;

    const promesa = calcular(clave)
      .then((valor) => {
        listos.set(clave, { valor, venceEn: Date.now() + ttlMs });
        return valor;
      })
      .finally(() => {
        // Un fallo no se cachea: el proximo intento vuelve a consultar,
        // en vez de dejar la sucursal rota hasta que venza el TTL.
        enCurso.delete(clave);
      });

    enCurso.set(clave, promesa);
    return promesa;
  };
}
