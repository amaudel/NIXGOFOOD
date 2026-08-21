'use client';

import React, { useState, useEffect } from 'react';
import { Store, Plus, Save, Edit, X, AlertCircle, ToggleLeft, ToggleRight, Phone, MapPin } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { BranchMapPicker } from '@/components/admin/BranchMapPicker';
import { Branch } from '@/types';
import { getBusinessRepository } from '@/repositories/factory';
import { CURRENT_BUSINESS_ID } from '@/config/business';

export default function BranchesClientPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [latitude, setLatitude] = useState('-2.90055');
  const [longitude, setLongitude] = useState('-79.00453');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadBranches = async () => {
    try {
      setError(null);
      const repo = getBusinessRepository();
      const data = await repo.getBranches(CURRENT_BUSINESS_ID);
      setBranches(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar las sucursales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleOpenCreate = () => {
    setEditingBranchId(null);
    setName('');
    setAddress('');
    setPhone('');
    setLatitude('-2.90055');
    setLongitude('-79.00453');
    setActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Branch) => {
    setEditingBranchId(b.id);
    setName(b.name);
    setAddress(b.address);
    setPhone(b.phone || '');
    setLatitude(b.latitude.toString());
    setLongitude(b.longitude.toString());
    setActive(b.active !== false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!name.trim() || !address.trim()) {
      setFormError('El nombre y la dirección son obligatorios.');
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setFormError('Las coordenadas deben ser números válidos.');
      return;
    }

    setSaving(true);

    try {
      const repo = getBusinessRepository();
      await repo.saveBranch({
        id: editingBranchId || undefined,
        businessId: CURRENT_BUSINESS_ID,
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim() || undefined,
        latitude: lat,
        longitude: lng,
        active,
      });

      await loadBranches();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la sucursal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Store className="w-6 h-6 text-rose-500" />
              <span>Sucursales</span>
            </h1>
            <p className="text-xs text-zinc-400">
              Administra las sucursales del negocio: ubicación, contacto y disponibilidad.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva sucursal</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando sucursales...</div>
        ) : (
          <div className="space-y-3">
            {branches.map((b) => {
              const isActive = b.active !== false;
              return (
                <div
                  key={b.id}
                  className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-base text-white">{b.name}</h3>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                          isActive
                            ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                            : 'text-zinc-400 bg-zinc-800 border-zinc-700'
                        }`}
                      >
                        {isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{b.address}</span>
                    </p>
                    {b.phone && (
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{b.phone}</span>
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      Coordenadas: {b.latitude}, {b.longitude}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleOpenEdit(b)}
                      className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create/Edit Branch Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
                <h3 className="font-extrabold text-lg text-white">
                  {editingBranchId ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4 overflow-y-auto px-6 py-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: El Taca Nijo - Matriz Cuenca"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Dirección *
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Av. Remigio Crespo Toral y Agustín Cueva, Cuenca"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0991234567"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Ubicación en el mapa
                  </label>
                  <div className="w-full h-64">
                    <BranchMapPicker
                      latitude={Number.isNaN(parseFloat(latitude)) ? -2.90055 : parseFloat(latitude)}
                      longitude={Number.isNaN(parseFloat(longitude)) ? -79.00453 : parseFloat(longitude)}
                      onPositionChange={(lat, lng) => {
                        setLatitude(lat.toString());
                        setLongitude(lng.toString());
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Arrastra el marcador o haz click en el mapa para ubicar la sucursal.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Latitud *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Longitud *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setActive((a) => !a)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border transition-all ${
                      active
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    <span>{active ? 'Activa' : 'Inactiva'}</span>
                  </button>
                  <p className="text-[11px] text-zinc-500">
                    Una sucursal inactiva deja de aparecer para los clientes, pero se conserva en el historial de
                    pedidos.
                  </p>
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
                  <span>{saving ? 'Guardando...' : 'Guardar Sucursal'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
