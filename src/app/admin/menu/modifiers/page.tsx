'use client';

import React, { useState, useEffect } from 'react';
import { Sliders, Plus, Edit, Trash2, Save, X, AlertCircle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { ModifierGroup, Modifier } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';

export default function AdminModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [required, setRequired] = useState(false);
  const [minSelect, setMinSelect] = useState('0');
  const [maxSelect, setMaxSelect] = useState('1');

  // Modifier item inside group modal
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [modName, setModName] = useState('');
  const [modPrice, setModPrice] = useState('0.00');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadGroups = async () => {
    try {
      setError(null);
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
        setGroups([
          {
            id: 'grp_protein',
            name: 'Elige tu proteína',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            modifiers: [
              { id: 'm1', name: 'Res Birria Tradicional', price: 0, isAvailable: true },
              { id: 'm2', name: 'Cerdo Adobado', price: 0, isAvailable: true },
            ],
          },
          {
            id: 'grp_extras',
            name: 'Extras deliciosos',
            required: false,
            minSelect: 0,
            maxSelect: 4,
            modifiers: [
              { id: 'm3', name: 'Extra Queso Oaxaca', price: 0.5, isAvailable: true },
              { id: 'm4', name: 'Guacamole Casero', price: 0.75, isAvailable: true },
            ],
          },
        ]);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('modifier_groups')
        .select(`
          *,
          modifiers (*)
        `)
        .eq('business_id', CURRENT_BUSINESS_ID)
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (err) throw new Error(err.message);

      setGroups(
        (data || []).map((g: any) => ({
          id: g.id,
          businessId: g.business_id,
          name: g.name,
          required: g.required,
          minSelect: g.min_selections,
          maxSelect: g.max_selections,
          modifiers: (g.modifiers || [])
            .filter((m: any) => m.active !== false)
            .map((m: any) => ({
              id: m.id,
              modifierGroupId: m.modifier_group_id,
              name: m.name,
              price: parseFloat(m.price_delta),
              isAvailable: m.available !== false,
            })),
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Error al cargar modificadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleOpenCreateGroup = () => {
    setEditingGroupId(null);
    setGroupName('');
    setRequired(false);
    setMinSelect('0');
    setMaxSelect('1');
    setFormError(null);
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!groupName.trim()) {
      setFormError('El nombre del grupo es obligatorio.');
      return;
    }
    setSaving(true);

    try {
      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const payload = {
          business_id: CURRENT_BUSINESS_ID,
          name: groupName.trim(),
          required,
          min_selections: parseInt(minSelect, 10) || 0,
          max_selections: parseInt(maxSelect, 10) || 1,
          updated_at: new Date().toISOString(),
        };

        if (editingGroupId) {
          const { error: err } = await supabase.from('modifier_groups').update(payload).eq('id', editingGroupId);
          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await supabase.from('modifier_groups').insert([payload]);
          if (err) throw new Error(err.message);
        }
      }
      await loadGroups();
      setIsGroupModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar grupo.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCreateMod = (grpId: string) => {
    setTargetGroupId(grpId);
    setEditingModId(null);
    setModName('');
    setModPrice('0.00');
    setFormError(null);
    setIsModModalOpen(true);
  };

  const handleSaveMod = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!modName.trim()) {
      setFormError('El nombre de la opción es obligatorio.');
      return;
    }
    const delta = parseFloat(modPrice);
    if (isNaN(delta) || delta < 0) {
      setFormError('El precio adicional debe ser un número válido.');
      return;
    }
    setSaving(true);

    try {
      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const payload = {
          business_id: CURRENT_BUSINESS_ID,
          modifier_group_id: targetGroupId,
          name: modName.trim(),
          price_delta: delta,
          available: true,
          updated_at: new Date().toISOString(),
        };

        if (editingModId) {
          const { error: err } = await supabase.from('modifiers').update(payload).eq('id', editingModId);
          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await supabase.from('modifiers').insert([payload]);
          if (err) throw new Error(err.message);
        }
      }
      await loadGroups();
      setIsModModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar opción.');
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
              <Sliders className="w-6 h-6 text-rose-500" />
              <span>Grupos de Modificadores y Extras</span>
            </h1>
            <p className="text-xs text-zinc-400">
              Crea opciones reutilizables como proteínas, términos de carne o extras con costo adicional.
            </p>
          </div>

          <button
            onClick={handleOpenCreateGroup}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Grupo</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando modificadores...</div>
        ) : (
          <div className="space-y-6">
            {groups.map((grp) => (
              <div key={grp.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h3 className="font-extrabold text-base text-white">{grp.name}</h3>
                    <span className="text-xs text-zinc-400 font-medium">
                      {grp.required ? 'Obligatorio (Seleccionar 1)' : 'Opcional'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenCreateMod(grp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-rose-400 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Opción</span>
                  </button>
                </div>

                {/* Modifiers List */}
                <div className="space-y-2">
                  {grp.modifiers.map((mod) => (
                    <div
                      key={mod.id}
                      className="bg-zinc-950 p-3 rounded-xl border border-zinc-850 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-zinc-200">{mod.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-amber-400">
                          {mod.price > 0 ? `+$${mod.price.toFixed(2)}` : '$0.00'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Group Modal */}
        {isGroupModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">Nuevo Grupo de Modificadores</h3>
                <button
                  onClick={() => setIsGroupModalOpen(false)}
                  className="p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveGroup} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Nombre del Grupo *
                  </label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ej: Extras, Término de Carne"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Es Selección Obligatoria</span>
                </label>

                {formError && (
                  <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl text-xs text-rose-300">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold py-3 px-6 rounded-2xl transition-all text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Guardar Grupo'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Create Modifier Item Modal */}
        {isModModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">Nueva Opción del Grupo</h3>
                <button
                  onClick={() => setIsModModalOpen(false)}
                  className="p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMod} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Nombre de la Opción *
                  </label>
                  <input
                    type="text"
                    required
                    value={modName}
                    onChange={(e) => setModName(e.target.value)}
                    placeholder="Ej: Extra Queso Oaxaca"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Costo Adicional ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={modPrice}
                    onChange={(e) => setModPrice(e.target.value)}
                    placeholder="0.50"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {formError && (
                  <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl text-xs text-rose-300">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold py-3 px-6 rounded-2xl transition-all text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando...' : 'Guardar Opción'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
