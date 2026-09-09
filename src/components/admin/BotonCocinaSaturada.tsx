'use client';

import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/context/BranchContext';
import { useApp } from '@/context/AppContext';

/**
 * Freno manual de los tiempos, para cuando la cocina se satura.
 *
 * Vive en la pantalla de cocina y no en Configuracion a proposito:
 * cuando el local se llena, nadie va a entrar a un formulario a buscar
 * un campo. Tiene que estar donde esta la persona, y en un toque.
 */

/** Se apaga solo despues de un rato: un "estamos a full" que nadie
 *  recuerda desactivar dejaria los tiempos inflados para siempre. */
const HORAS_VIGENCIA = 4;

const OPCIONES = [10, 20, 30];

export const BotonCocinaSaturada: React.FC = () => {
  const { selectedBranch } = useBranch();
  const { isDemo } = useApp();

  const [extra, setExtra] = useState(0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (isDemo || !selectedBranch?.id) return;
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('branches')
          .select('manual_extra_minutes, manual_extra_until')
          .eq('id', selectedBranch.id)
          .maybeSingle();

        if (!data) return;
        const vencido = data.manual_extra_until
          ? new Date(data.manual_extra_until).getTime() <= Date.now()
          : false;
        setExtra(vencido ? 0 : data.manual_extra_minutes || 0);
      } catch {
        // Si no se puede leer, se muestra apagado: es el estado seguro.
      }
    }
    cargar();
  }, [isDemo, selectedBranch?.id]);

  const aplicar = async (minutos: number) => {
    setExtra(minutos);
    if (isDemo || !selectedBranch?.id) return;

    setGuardando(true);
    try {
      const supabase = createClient();
      await supabase
        .from('branches')
        .update({
          manual_extra_minutes: minutos,
          manual_extra_until:
            minutos > 0
              ? new Date(Date.now() + HORAS_VIGENCIA * 60 * 60 * 1000).toISOString()
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedBranch.id);
    } catch {
      // El estado local ya cambio; al recargar se ve lo que quedo guardado.
    } finally {
      setGuardando(false);
    }
  };

  const activo = extra > 0;

  return (
    <div
      className={`p-3 rounded-2xl border space-y-2 ${
        activo ? 'bg-amber-950/60 border-amber-700' : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold flex items-center gap-1.5 text-white">
          <Flame className={`w-4 h-4 ${activo ? 'text-amber-400' : 'text-zinc-500'}`} />
          <span>{activo ? `A FULL · +${extra} min` : 'Cocina al día'}</span>
        </span>
        {activo && (
          <button
            onClick={() => aplicar(0)}
            disabled={guardando}
            className="text-[11px] font-bold text-amber-300 hover:text-amber-100 underline underline-offset-2 disabled:opacity-50"
          >
            Volver a normal
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {OPCIONES.map((minutos) => (
          <button
            key={minutos}
            onClick={() => aplicar(minutos)}
            disabled={guardando}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all disabled:opacity-50 ${
              extra === minutos
                ? 'bg-amber-500 border-amber-400 text-zinc-950'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            +{minutos} min
          </button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500">
        {activo
          ? `Se suma al tiempo que ve el cliente. Se apaga solo en ${HORAS_VIGENCIA} h.`
          : 'Súmale minutos al tiempo que ve el cliente cuando la cocina se complica.'}
      </p>
    </div>
  );
};
