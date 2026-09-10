'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Gift } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { isDemoMode } from '@/config/demo';
import { getLoyaltyProgramConfig, saveLoyaltyProgramConfig } from '@/lib/loyalty';
import { LoyaltyProgramConfig } from '@/types';

const DEFAULT_CONFIG: LoyaltyProgramConfig = {
  enabled: false,
  pointsPerCurrencyUnit: 1,
  redemptionValuePerPoint: 0.01,
  maxRedeemPercent: 30,
};

export default function SettingsLoyaltyClientPage() {
  const { businessId } = useApp();
  const isDemo = isDemoMode();
  const [config, setConfig] = useState<LoyaltyProgramConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isDemo || !businessId) return;
    getLoyaltyProgramConfig(businessId).then((loaded) => {
      if (loaded) setConfig(loaded);
    });
  }, [isDemo, businessId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!businessId) {
      setMessage({ type: 'error', text: 'No se pudo identificar el negocio. Recargá la página e intentá de nuevo.' });
      return;
    }
    setSaving(true);
    try {
      await saveLoyaltyProgramConfig(businessId, config);
      setMessage({ type: 'success', text: '✓ Configuración de fidelización guardada.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-extrabold text-white mb-1 flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          Fidelización de clientes
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          Tus clientes acumulan puntos por lo que gastan y los pueden canjear por descuento en un pedido futuro.
        </p>

        {isDemo ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-sm text-zinc-400 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>La fidelización no está disponible en modo demo. Conecta un negocio real para configurarla.</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <label className="flex items-center gap-2.5 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="w-4 h-4 accent-amber-400"
              />
              Activar programa de puntos
            </label>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Puntos por cada $1 gastado
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={config.pointsPerCurrencyUnit}
                onChange={(e) => setConfig({ ...config, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Valor de cada punto al canjear ($)
              </label>
              <input
                type="number"
                min={0}
                step={0.001}
                value={config.redemptionValuePerPoint}
                onChange={(e) => setConfig({ ...config, redemptionValuePerPoint: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Tope de canje (% del subtotal)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={config.maxRedeemPercent}
                onChange={(e) => setConfig({ ...config, maxRedeemPercent: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-zinc-100"
              />
            </div>

            {message && (
              <div
                className={`flex items-center gap-2 text-sm rounded-xl p-3 ${
                  message.type === 'success' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                }`}
              >
                {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-3 rounded-xl transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
