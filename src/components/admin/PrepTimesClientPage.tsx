'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Timer, Plus, Save, Trash2, X, AlertCircle, Zap, Info } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { useBranch } from '@/context/BranchContext';
import { useApp } from '@/context/AppContext';
import { EscalonDeCarga, calcularMinutosExtra } from '@/lib/demoraPorCarga';
import { validarEscalones } from '@/lib/validarEscalones';
import { RETIRO_POR_DEFECTO } from '@/lib/prepTimeConfig';
import { contarItemsPendientes } from '@/lib/cargaPendiente';
import { OrderRepository } from '@/repositories/OrderRepository';

interface EscalonEditable extends EscalonDeCarga {
  id: string;
}

const ESCALONES_DEMO: EscalonEditable[] = [
  { id: 'demo-1', desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
  { id: 'demo-2', desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
  { id: 'demo-3', desdeItems: 26, hastaItems: null, minutosExtra: 20 },
];

export default function PrepTimesClientPage() {
  const { businessId, isDemo } = useApp();
  const { selectedBranch, loading: branchLoading } = useBranch();

  const [escalones, setEscalones] = useState<EscalonEditable[]>([]);
  const [prepMin, setPrepMin] = useState(String(RETIRO_POR_DEFECTO.min));
  const [prepMax, setPrepMax] = useState(String(RETIRO_POR_DEFECTO.max));
  const [techo, setTecho] = useState('30');
  const [autoActivo, setAutoActivo] = useState(true);
  const [itemsPendientes, setItemsPendientes] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [desde, setDesde] = useState('0');
  const [hasta, setHasta] = useState('');
  const [extra, setExtra] = useState('0');

  useEffect(() => {
    async function cargar() {
      if (branchLoading || !selectedBranch?.id) return;
      setLoading(true);

      // La carga se cuenta igual en demo y en real: OrderRepository ya
      // resuelve de donde salen los pedidos, y contarItemsPendientes
      // aplica los mismos estados y la misma ventana que el servidor.
      try {
        const pedidos = await OrderRepository.getOrders(businessId, selectedBranch.id);
        setItemsPendientes(contarItemsPendientes(pedidos));
      } catch {
        setItemsPendientes(0);
      }

      if (isDemo) {
        setEscalones(ESCALONES_DEMO);
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        const [sucursalRes, tiersRes] = await Promise.all([
          supabase
            .from('branches')
            .select(
              'pickup_prep_min_minutes, pickup_prep_max_minutes, auto_delay_enabled, max_extra_minutes'
            )
            .eq('id', selectedBranch.id)
            .maybeSingle(),
          supabase
            .from('prep_time_tiers')
            .select('id, from_items, to_items, extra_minutes')
            .eq('branch_id', selectedBranch.id)
            .order('from_items', { ascending: true }),
        ]);

        if (sucursalRes.data) {
          setPrepMin(String(sucursalRes.data.pickup_prep_min_minutes ?? RETIRO_POR_DEFECTO.min));
          setPrepMax(String(sucursalRes.data.pickup_prep_max_minutes ?? RETIRO_POR_DEFECTO.max));
          setTecho(String(sucursalRes.data.max_extra_minutes ?? 30));
          setAutoActivo(sucursalRes.data.auto_delay_enabled ?? true);
        }

        setEscalones(
          (tiersRes.data || []).map((t: any) => ({
            id: t.id,
            desdeItems: t.from_items,
            hastaItems: t.to_items,
            minutosExtra: t.extra_minutes,
          }))
        );

      } catch (err: any) {
        setMensaje({ tipo: 'error', texto: err.message || 'No se pudo cargar la configuración.' });
      } finally {
        setLoading(false);
      }
    }

    cargar();
  }, [isDemo, selectedBranch?.id, branchLoading]);

  const avisos = useMemo(() => validarEscalones(escalones), [escalones]);

  const extraVigente = useMemo(
    () =>
      calcularMinutosExtra(itemsPendientes, {
        escalones,
        automaticoActivo: autoActivo,
        minutosManuales: 0,
        techoMinutos: Number(techo) || 0,
      }),
    [itemsPendientes, escalones, autoActivo, techo]
  );

  const guardarAjustes = async () => {
    setSaving(true);
    setMensaje(null);

    if (isDemo) {
      setMensaje({ tipo: 'ok', texto: '✓ Guardado localmente (modo demostración).' });
      setSaving(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('branches')
        .update({
          pickup_prep_min_minutes: Number(prepMin) || 0,
          pickup_prep_max_minutes: Number(prepMax) || 0,
          max_extra_minutes: Number(techo) || 0,
          auto_delay_enabled: autoActivo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedBranch!.id);

      if (error) throw new Error(error.message);
      setMensaje({ tipo: 'ok', texto: '✓ Tiempos guardados.' });
    } catch (err: any) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const agregarEscalon = async () => {
    const nuevo: EscalonEditable = {
      id: `tmp-${Date.now()}`,
      desdeItems: Number(desde) || 0,
      hastaItems: hasta.trim() === '' ? null : Number(hasta),
      minutosExtra: Number(extra) || 0,
    };

    if (isDemo) {
      setEscalones((prev) => [...prev, nuevo].sort((a, b) => a.desdeItems - b.desdeItems));
      setModalAbierto(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('prep_time_tiers')
        .insert({
          business_id: businessId,
          branch_id: selectedBranch!.id,
          from_items: nuevo.desdeItems,
          to_items: nuevo.hastaItems,
          extra_minutes: nuevo.minutosExtra,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      setEscalones((prev) =>
        [...prev, { ...nuevo, id: data.id }].sort((a, b) => a.desdeItems - b.desdeItems)
      );
      setModalAbierto(false);
    } catch (err: any) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo agregar el tramo.' });
    }
  };

  const borrarEscalon = async (id: string) => {
    if (!isDemo) {
      try {
        const supabase = createClient();
        await supabase.from('prep_time_tiers').delete().eq('id', id);
      } catch {
        // Se saca igual de la lista: si fallo el borrado, al recargar vuelve.
      }
    }
    setEscalones((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Timer className="w-6 h-6 text-rose-500" />
            <span>Tiempos de Preparación</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {selectedBranch?.name
              ? `Tiempos de ${selectedBranch.name}.`
              : 'Tiempos de la sucursal.'}{' '}
            Cuando la cocina se llena, el tiempo que ve el cliente se estira solo.
          </p>
        </div>

        {mensaje && (
          <div
            className={`p-3 rounded-2xl text-xs border ${
              mensaje.tipo === 'ok'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando tiempos...</div>
        ) : (
          <>
            {/* Estado en vivo: por que el sistema esta (o no) estirando. */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-1">
              <p className="text-sm font-extrabold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Ahora mismo</span>
              </p>
              <p className="text-xs text-zinc-400">
                <strong className="text-zinc-200">{itemsPendientes} ítems</strong> pendientes en
                cocina ·{' '}
                {extraVigente > 0 ? (
                  <strong className="text-amber-400">+{extraVigente} min aplicados</strong>
                ) : (
                  <span className="text-emerald-400">sin demora extra</span>
                )}
              </p>
            </div>

            {/* Tiempo base de retiro + techo + interruptor */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-4">
              <h2 className="font-extrabold text-sm text-white">Tiempo base</h2>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Retiro en local: mínimo
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={prepMin}
                    onChange={(e) => setPrepMin(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-1.5 block">
                  <span className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Retiro en local: máximo
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={prepMax}
                    onChange={(e) => setPrepMax(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </label>
              </div>

              <label className="space-y-1.5 block">
                <span className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Nunca sumar más de (minutos)
                </span>
                <input
                  type="number"
                  min={0}
                  value={techo}
                  onChange={(e) => setTecho(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
                <span className="block text-[11px] text-zinc-500">
                  Un tope para que un pico raro no le muestre al cliente un tiempo que lo espante.
                </span>
              </label>

              <button
                type="button"
                onClick={() => setAutoActivo((v) => !v)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all ${
                  autoActivo
                    ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                <span>Ajuste automático por carga</span>
                <span>{autoActivo ? 'ACTIVADO' : 'DESACTIVADO'}</span>
              </button>

              <button
                onClick={guardarAjustes}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3 px-4 rounded-2xl shadow-lg transition-all text-xs disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Guardando...' : 'Guardar tiempo base'}</span>
              </button>
            </div>

            {/* Escalones */}
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-extrabold text-sm text-white">Escalones de carga</h2>
                  <p className="text-[11px] text-zinc-500">
                    Cuántos minutos sumar según los ítems pendientes.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setDesde('0');
                    setHasta('');
                    setExtra('0');
                    setModalAbierto(true);
                  }}
                  className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-2 rounded-xl border border-zinc-700 text-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar tramo</span>
                </button>
              </div>

              {avisos.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-800/70 p-3 rounded-xl space-y-1">
                  {avisos.map((aviso, i) => (
                    <p key={i} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{aviso}</span>
                    </p>
                  ))}
                </div>
              )}

              {escalones.length === 0 ? (
                <p className="text-xs text-zinc-500 flex items-center gap-2 py-4">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>
                    Sin tramos configurados los tiempos nunca se estiran. Todo sigue como hasta
                    ahora.
                  </span>
                </p>
              ) : (
                <div className="space-y-2">
                  {escalones.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl"
                    >
                      <span className="text-xs text-zinc-300">
                        {e.hastaItems === null
                          ? `${e.desdeItems} ítems o más`
                          : `${e.desdeItems} a ${e.hastaItems} ítems`}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-extrabold ${
                            e.minutosExtra > 0 ? 'text-amber-400' : 'text-zinc-500'
                          }`}
                        >
                          {e.minutosExtra > 0 ? `+${e.minutosExtra} min` : 'sin extra'}
                        </span>
                        <button
                          onClick={() => borrarEscalon(e.id)}
                          aria-label="Eliminar tramo"
                          className="w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-white">Nuevo tramo</h3>
              <button
                onClick={() => setModalAbierto(false)}
                aria-label="Cerrar"
                className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 block">
                <span className="block text-[11px] font-bold text-zinc-400 uppercase">Desde</span>
                <input
                  type="number"
                  min={0}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="block text-[11px] font-bold text-zinc-400 uppercase">Hasta</span>
                <input
                  type="number"
                  min={0}
                  value={hasta}
                  placeholder="sin tope"
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-rose-500 focus:outline-none"
                />
              </label>
            </div>

            <label className="space-y-1.5 block">
              <span className="block text-[11px] font-bold text-zinc-400 uppercase">
                Minutos a sumar
              </span>
              <input
                type="number"
                min={0}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
              />
            </label>

            <p className="text-[11px] text-zinc-500">
              Dejá &quot;Hasta&quot; vacío en el último tramo para que cubra cualquier carga.
            </p>

            <button
              onClick={agregarEscalon}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white font-extrabold py-3 px-4 rounded-2xl text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar tramo</span>
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
