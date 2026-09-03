'use client';

import React, { useState, useEffect } from 'react';
import { Bike, Plus, Save, Edit, Trash2, X, AlertCircle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Motorizado } from '@/types';
import { getBusinessRepository } from '@/repositories/factory';
import { useBranch } from '@/context/BranchContext';
import { useApp } from '@/context/AppContext';

export default function MotorizadosClientPage() {
  const { businessId } = useApp();
  const [motorizados, setMotorizados] = useState<Motorizado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { selectedBranch, loading: branchLoading } = useBranch();
  const repo = getBusinessRepository();

  const loadMotorizados = async () => {
    try {
      setError(null);
      const data = await repo.getMotorizados(selectedBranch?.id, businessId);
      setMotorizados(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los motorizados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (branchLoading) return;
    setLoading(true);
    loadMotorizados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id, branchLoading, businessId]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setWhatsapp('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: Motorizado) => {
    setEditingId(m.id);
    setName(m.name);
    setWhatsapp(m.whatsapp);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('El nombre del motorizado es obligatorio.');
      return;
    }
    if (!whatsapp.trim()) {
      setFormError('El número de WhatsApp es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      await repo.saveMotorizado(
        {
          id: editingId || undefined,
          branchId: selectedBranch!.id,
          name: name.trim(),
          whatsapp: whatsapp.trim(),
        },
        businessId
      );
      await loadMotorizados();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el motorizado.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro de eliminar este motorizado?')) return;
    try {
      await repo.deleteMotorizado(id);
      await loadMotorizados();
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
              <Bike className="w-6 h-6 text-rose-500" />
              <span>Motorizados</span>
            </h1>
            <p className="text-xs text-zinc-400">
              {selectedBranch?.name ? `Repartidores de ${selectedBranch.name}.` : 'Repartidores del local.'}{' '}
              Aparecerán como destino directo al enviar la ubicación de un pedido por WhatsApp.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Motorizado</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando motorizados...</div>
        ) : motorizados.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
            No hay motorizados registrados en esta sucursal todavía.
          </div>
        ) : (
          <div className="space-y-3">
            {motorizados.map((m) => (
              <div
                key={m.id}
                className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl"
              >
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-white">{m.name}</h3>
                  <p className="text-xs text-zinc-400">📱 {m.whatsapp}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleOpenEdit(m)}
                    className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">
                  {editingId ? 'Editar Motorizado' : 'Nuevo Motorizado'}
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
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Luis Torres"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Ej: 0991112222"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-zinc-500">Incluye código de país si es posible (ej: 593991112222).</p>
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
                  <span>{saving ? 'Guardando...' : 'Guardar Motorizado'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
