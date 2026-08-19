'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Save, CheckCircle, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { BusinessHours } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID, activeBranch } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';

const daysOfWeekNames = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export default function HoursClientPage() {
  const [hours, setHours] = useState<BusinessHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isDemo = isDemoMode();

  const loadHours = async () => {
    try {
      setMessage(null);
      if (isDemo) {
        const demoHours = await DemoBusinessRepository.getBusinessHours();
        setHours(demoHours);
        setLoading(false);
        return;
      }

      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
        const demoHours = await DemoBusinessRepository.getBusinessHours();
        setHours(demoHours);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('business_hours')
        .select('*')
        .eq('business_id', CURRENT_BUSINESS_ID)
        .order('day_of_week', { ascending: true });

      if (err) throw new Error(err.message);

      if (data && data.length > 0) {
        setHours(
          data.map((h: any) => ({
            id: h.id,
            businessId: h.business_id,
            branchId: h.branch_id,
            dayOfWeek: h.day_of_week,
            openTime: h.open_time,
            closeTime: h.close_time,
            closed: h.closed,
          }))
        );
      } else {
        const defaultHours: BusinessHours[] = daysOfWeekNames.map((_, idx) => ({
          businessId: CURRENT_BUSINESS_ID,
          branchId: activeBranch.id,
          dayOfWeek: idx,
          openTime: '09:00:00',
          closeTime: '23:00:00',
          closed: false,
        }));
        setHours(defaultHours);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar horarios.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHours();
  }, [isDemo]);

  const handleHourChange = (dayOfWeek: number, field: keyof BusinessHours, value: any) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      if (isDemo) {
        await DemoBusinessRepository.saveBusinessHours(hours);
        setMessage({ type: 'success', text: '✓ Horarios de atención guardados localmente (Modo Demo).' });
        setSaving(false);
        return;
      }

      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();

        for (const h of hours) {
          const payload = {
            business_id: CURRENT_BUSINESS_ID,
            branch_id: activeBranch.id,
            day_of_week: h.dayOfWeek,
            open_time: h.openTime,
            close_time: h.closeTime,
            closed: h.closed,
            updated_at: new Date().toISOString(),
          };

          const { error: upsertErr } = await supabase
            .from('business_hours')
            .upsert(payload, { onConflict: 'branch_id,day_of_week' });

          if (upsertErr) throw new Error(upsertErr.message);
        }
      }

      setMessage({ type: 'success', text: '✓ Horarios de atención guardados correctamente.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar horarios.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-rose-500" />
            <span>Horarios de Atención</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Define la jornada de atención semanal en la zona horaria del restaurante (America/Guayaquil).
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando horarios...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="space-y-3">
                {hours.map((h) => (
                  <div
                    key={h.dayOfWeek}
                    className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-24 font-bold text-sm text-zinc-100">{daysOfWeekNames[h.dayOfWeek]}</span>
                      <button
                        type="button"
                        onClick={() => handleHourChange(h.dayOfWeek, 'closed', !h.closed)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border transition-all ${
                          !h.closed
                            ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                            : 'bg-rose-950 border-rose-800 text-rose-400'
                        }`}
                      >
                        {!h.closed ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        <span>{!h.closed ? 'Abierto' : 'Cerrado'}</span>
                      </button>
                    </div>

                    {!h.closed && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <span>Apertura:</span>
                          <input
                            type="time"
                            value={h.openTime.substring(0, 5)}
                            onChange={(e) => handleHourChange(h.dayOfWeek, 'openTime', `${e.target.value}:00`)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-100 font-bold focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <span>Cierre:</span>
                          <input
                            type="time"
                            value={h.closeTime.substring(0, 5)}
                            onChange={(e) => handleHourChange(h.dayOfWeek, 'closeTime', `${e.target.value}:00`)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-100 font-bold focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl active:scale-95 disabled:opacity-50 transition-all text-sm"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando horarios...' : 'Guardar Horarios'}</span>
            </button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
