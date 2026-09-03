'use client';

import { useEffect, useState } from 'react';

export interface DemoraCocina {
  minutosExtra: number;
  /** Rango de retiro en local con el extra ya aplicado, o null. */
  rangoRetiro: string | null;
}

const SIN_DEMORA: DemoraCocina = { minutosExtra: 0, rangoRetiro: null };

/**
 * Demora vigente de la cocina de una sucursal.
 *
 * El conteo ocurre en el servidor (la tabla de pedidos esta protegida) y
 * de aca sale solo un numero de minutos. Nunca lanza ni bloquea: si la
 * consulta falla, devuelve "sin demora" y el cliente ve el tiempo base.
 * Esto jamas puede impedir una compra.
 */
export function useDemoraCocina(branchId: string | null | undefined): DemoraCocina {
  const [demora, setDemora] = useState<DemoraCocina>(SIN_DEMORA);

  useEffect(() => {
    if (!branchId) {
      setDemora(SIN_DEMORA);
      return;
    }

    let vigente = true;
    const controlador = new AbortController();

    fetch(`/api/prep-time?branchId=${encodeURIComponent(branchId)}`, {
      signal: controlador.signal,
    })
      .then((res) => (res.ok ? res.json() : SIN_DEMORA))
      .then((data) => {
        // `vigente` evita pisar el estado con la respuesta de una
        // sucursal que el cliente ya cambio.
        if (!vigente) return;
        setDemora({
          minutosExtra: Number(data?.minutosExtra) || 0,
          rangoRetiro: data?.rangoRetiro ?? null,
        });
      })
      .catch(() => {
        if (vigente) setDemora(SIN_DEMORA);
      });

    return () => {
      vigente = false;
      controlador.abort();
    };
  }, [branchId]);

  return demora;
}
