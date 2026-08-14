'use client';

import React, { useState, useEffect } from 'react';
import { Truck, Plus, Save, Edit, Trash2, X, AlertCircle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { DeliveryZone } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID, activeBranch } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';

export default function AdminDeliveryPage() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('2.0');
  const [fee, setFee] = useState('1.50');
  const [estimatedMinMinutes, setEstimatedMinMinutes] = useState('20');
  const [estimatedMaxMinutes, setEstimatedMaxMinutes] = useState('30');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDemo = isDemoMode();

  const loadZones = async () => {
    try {
      setError(null);
      if (isDemo) {
        const demoZones = await DemoBusinessRepository.getDeliveryZones();
        setZones(demoZones);
        setLoading(false);
        return;
      }

      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
        const demoZones = await DemoBusinessRepository.getDeliveryZones();
        setZones(demoZones);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('business_id', CURRENT_BUSINESS_ID)
        .eq('active', true)
        .order('max_distance_km', { ascending: true });

      if (err) throw new Error(err.message);

      setZones(
        (data || []).map((z: any) => ({
          id: z.id,
          businessId: z.business_id,
          branchId: z.branch_id,
          name: z.name,
          maxDistanceKm: parseFloat(z.max_distance_km),
          fee: parseFloat(z.fee),
          estimatedMinutes: `${z.estimated_min_minutes}-${z.estimated_max_minutes} min`,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Error al cargar zonas de delivery.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, [isDemo]);

  const handleOpenCreate = () => {
    setEditingZoneId(null);
    setName(`Zona ${zones.length + 1}`);
    setMaxDistanceKm(((zones.length + 1) * 2.0).toFixed(1));
    setFee((1.5 + zones.length * 0.5).toFixed(2));
    setEstimatedMinMinutes('20');
    setEstimatedMaxMinutes('35');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (z: DeliveryZone) => {
    setEditingZoneId(z.id);
    setName(z.name);
    setMaxDistanceKm(z.maxDistanceKm.toString());
    setFee(z.fee.toString());
    const times = z.estimatedMinutes.replace(' min', '').split('-');
    setEstimatedMinMinutes(times[0] || '20');
    setEstimatedMaxMinutes(times[1] || '35');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const dist = parseFloat(maxDistanceKm);
    const feeVal = parseFloat(fee);

    if (!name.trim()) {
      setFormError('El nombre de la zona es obligatorio.');
      return;
    }

    if (isNaN(dist) || dist <= 0) {
      setFormError('La distancia máxima debe ser un número positivo.');
      return;
    }

    if (isNaN(feeVal) || feeVal < 0) {
      setFormError('La tarifa debe ser un número válido.');
      return;
    }

    setSaving(true);

    try {
      if (isDemo) {
        let updated = [...zones];
        if (editingZoneId) {
          updated = updated.map((z) =>
            z.id === editingZoneId
              ? {
                  ...z,
                  name: name.trim(),
                  maxDistanceKm: dist,
                  fee: feeVal,
                  estimatedMinutes: `${estimatedMinMinutes}-${estimatedMaxMinutes} min`,
                }
              : z
          );
        } else {
          updated.push({
            id: `z_demo_${Date.now()}`,
            businessId: CURRENT_BUSINESS_ID,
            branchId: activeBranch.id,
            name: name.trim(),
            maxDistanceKm: dist,
            fee: feeVal,
            estimatedMinutes: `${estimatedMinMinutes}-${estimatedMaxMinutes} min`,
            active: true,
          });
        }
        await DemoBusinessRepository.saveDeliveryZones(updated);
        await loadZones();
        setIsModalOpen(false);
        setSaving(false);
        return;
      }

      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const payload = {
          business_id: CURRENT_BUSINESS_ID,
          branch_id: activeBranch.id,
          name: name.trim(),
          max_distance_km: dist,
          fee: feeVal,
          estimated_min_minutes: parseInt(estimatedMinMinutes, 10) || 20,
          estimated_max_minutes: parseInt(estimatedMaxMinutes, 10) || 35,
          updated_at: new Date().toISOString(),
        };

        if (editingZoneId) {
          const { error: err } = await supabase.from('delivery_zones').update(payload).eq('id', editingZoneId);
          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await supabase.from('delivery_zones').insert([payload]);
          if (err) throw new Error(err.message);
        }
      }

      await loadZones();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la zona.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId: string) => {
    if (!confirm('¿Seguro de eliminar esta zona de delivery?')) return;
    try {
      if (isDemo) {
        const updated = zones.filter((z) => z.id !== zoneId);
        await DemoBusinessRepository.saveDeliveryZones(updated);
        await loadZones();
        return;
      }

      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const { error: err } = await supabase
          .from('delivery_zones')
          .update({ active: false })
          .eq('id', zoneId);
        if (err) throw new Error(err.message);
      }
      await loadZones();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Truck className="w-6 h-6 text-rose-500" />
              <span>Zonas y Tarifas de Delivery</span>
            </h1>
            <p className="text-xs text-zinc-400">
              Configura los rangos de distancia en kilómetros desde el restaurante y sus costos de envío.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Zona</span>
          </button>
        </div>

        {/* Origin Branch Card */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-xs space-y-1">
          <p className="font-extrabold text-sm text-white">Origen del Delivery: {activeBranch.name}</p>
          <p className="text-zinc-400">📍 {activeBranch.address}</p>
          <p className="text-zinc-500">Coordenadas: {activeBranch.latitude}, {activeBranch.longitude}</p>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando zonas de delivery...</div>
        ) : (
          <div className="space-y-3">
            {zones.map((z) => (
              <div
                key={z.id}
                className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-white">{z.name}</h3>
                    <span className="text-xs font-bold text-amber-400 bg-amber-950 px-2.5 py-0.5 rounded-full border border-amber-800">
                      Hasta {z.maxDistanceKm} km
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">Tiempo estimado: {z.estimatedMinutes}</p>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 block uppercase font-bold">Tarifa</span>
                    <span className="text-xl font-black text-amber-400">${z.fee.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(z)}
                      className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(z.id)}
                      className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Zone Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">
                  {editingZoneId ? 'Editar Zona de Delivery' : 'Nueva Zona de Delivery'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Nombre de la Zona *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Zona 1 - Cercana"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Distancia Máxima (km) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={maxDistanceKm}
                      onChange={(e) => setMaxDistanceKm(e.target.value)}
                      placeholder="2.0"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Tarifa de Delivery ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                      placeholder="1.50"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Min Minutos
                    </label>
                    <input
                      type="number"
                      value={estimatedMinMinutes}
                      onChange={(e) => setEstimatedMinMinutes(e.target.value)}
                      placeholder="20"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Max Minutos
                    </label>
                    <input
                      type="number"
                      value={estimatedMaxMinutes}
                      onChange={(e) => setEstimatedMaxMinutes(e.target.value)}
                      placeholder="35"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold py-3 px-6 rounded-2xl transition-all text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Guardar Zona'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
