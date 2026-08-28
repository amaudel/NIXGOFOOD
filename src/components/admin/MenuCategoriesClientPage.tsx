'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Plus, Edit, Trash2, Save, X, AlertCircle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Category } from '@/types';
import { ProductRepository } from '@/repositories/ProductRepository';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoProductRepository } from '@/repositories/demo/DemoProductRepository';
import { useApp } from '@/context/AppContext';

export default function MenuCategoriesClientPage() {
  const { businessId } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🌮');
  const [sortOrder, setSortOrder] = useState('1');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDemo = isDemoMode();

  const loadCategories = async () => {
    try {
      setError(null);
      const data = await ProductRepository.getCategories(businessId);
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar categorías.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [businessId]);

  const handleOpenCreate = () => {
    setEditingCategoryId(null);
    setName('');
    setIcon('🌮');
    setSortOrder((categories.length + 1).toString());
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setName(cat.name);
    setIcon(cat.icon);
    setSortOrder(cat.sortOrder.toString());
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('El nombre de la categoría es obligatorio.');
      return;
    }

    setSaving(true);

    try {
      if (isDemo) {
        await DemoProductRepository.saveCategory({
          id: editingCategoryId || undefined,
          businessId: CURRENT_BUSINESS_ID,
          name: name.trim(),
          icon: icon.trim() || '🌮',
          sortOrder: parseInt(sortOrder, 10) || 1,
        });
        await loadCategories();
        setIsModalOpen(false);
        setSaving(false);
        return;
      }

      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');

        const payload = {
          business_id: businessId,
          name: name.trim(),
          slug: slug || 'categoria',
          icon: icon.trim() || '🌮',
          sort_order: parseInt(sortOrder, 10) || 1,
          updated_at: new Date().toISOString(),
        };

        if (editingCategoryId) {
          const { error: err } = await supabase
            .from('categories')
            .update(payload)
            .eq('id', editingCategoryId);
          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await supabase.from('categories').insert([payload]);
          if (err) throw new Error(err.message);
        }
      }

      await loadCategories();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (catId: string) => {
    if (!confirm('¿Seguro de eliminar esta categoría?')) return;
    try {
      if (!isDemo && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co') {
        const supabase = createClient();
        const { error: err } = await supabase
          .from('categories')
          .update({ active: false })
          .eq('id', catId);
        if (err) throw new Error(err.message);
      }
      await loadCategories();
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
              <Layers className="w-6 h-6 text-rose-500" />
              <span>Gestión de Categorías</span>
            </h1>
            <p className="text-xs text-zinc-400">
              Organiza las secciones de tu menú y define el orden de aparición.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Categoría</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando categorías...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{cat.icon}</span>
                  <div>
                    <h4 className="font-extrabold text-sm text-zinc-100">{cat.name}</h4>
                    <span className="text-[10px] text-zinc-500">Orden: #{cat.sortOrder}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(cat)}
                    className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">
                  {editingCategoryId ? 'Editar Categoría' : 'Nueva Categoría'}
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
                    Nombre de Categoría *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Tacos, Bebidas"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Icono / Emoji
                    </label>
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="🌮"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none text-center"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Orden
                    </label>
                    <input
                      type="number"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
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
                  <span>{saving ? 'Guardando...' : 'Guardar Categoría'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
