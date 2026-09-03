'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Upload,
  CheckCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  UtensilsCrossed,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Product, Category } from '@/types';
import { ProductRepository } from '@/repositories/ProductRepository';
import { StorageService } from '@/services/StorageService';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoProductRepository } from '@/repositories/demo/DemoProductRepository';
import { useApp } from '@/context/AppContext';

export default function MenuProductsClientPage() {
  const { businessId } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // fal.ai AI Image Generation Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [cats, prods] = await Promise.all([
        ProductRepository.getCategories(businessId),
        ProductRepository.getAllProducts(businessId),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (cats.length > 0) setCategoryId(cats[0].id);
    } catch (err: any) {
      setError(err.message || 'Error al cargar catálogo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId]);

  const handleOpenCreate = () => {
    setEditingProductId(null);
    setName('');
    setDescription('');
    setPrice('');
    setCompareAtPrice('');
    setImageUrl('https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80');
    setIsAvailable(true);
    setIsFeatured(false);
    if (categories.length > 0) setCategoryId(categories[0].id);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProductId(prod.id);
    setName(prod.name);
    setDescription(prod.description);
    setCategoryId(prod.categoryId);
    setPrice(prod.price.toString());
    setCompareAtPrice(prod.compareAtPrice ? prod.compareAtPrice.toString() : '');
    setImageUrl(prod.image);
    setIsAvailable(prod.isAvailable);
    setIsFeatured(!!prod.isPopular);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setFormError(null);

    const { url, error: uploadErr } = await StorageService.uploadImage(file, businessId, 'products');

    if (uploadErr) {
      setFormError(uploadErr);
    } else if (url) {
      setImageUrl(url);
    }
    setUploadingImage(false);
  };

  const handleOpenAiGenerator = () => {
    const defaultPrompt = name.trim()
      ? `${name}: ${description || 'Delicioso platillo artesanal recién preparado'}`
      : 'Taco artesanal mexicano con queso Oaxaca fundido y consomé calientito';

    setAiPrompt(defaultPrompt);
    setAiError(null);
    setIsAiModalOpen(true);
  };

  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) {
      setAiError('Ingresa un prompt para la generación.');
      return;
    }

    setGeneratingAi(true);
    setAiError(null);

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'No se pudo generar la imagen. Intenta de nuevo.');
      }

      if (data.url) {
        setImageUrl(data.url);
        setIsAiModalOpen(false);
      }
    } catch (err: any) {
      setAiError(err.message || 'Error de conexión con el servicio de IA.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleToggleAvailability = async (productId: string, currentStatus: boolean) => {
    try {
      await ProductRepository.setProductAvailability(productId, !currentStatus);
      await loadData();
    } catch (err: any) {
      alert(`Error al cambiar disponibilidad: ${err.message}`);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('El nombre del producto es obligatorio.');
      return;
    }

    if (!categoryId) {
      setFormError('Debes seleccionar una categoría.');
      return;
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setFormError('El precio debe ser un número válido mayor o igual a 0.');
      return;
    }

    setSaving(true);

    try {
      if (isDemoMode()) {
        await DemoProductRepository.saveProduct({
          id: editingProductId || undefined,
          businessId: CURRENT_BUSINESS_ID,
          categoryId,
          name: name.trim(),
          description: description.trim(),
          price: numPrice,
          compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
          image: imageUrl,
          isAvailable,
          isPopular: isFeatured,
        });
        await loadData();
        setIsModalOpen(false);
        setSaving(false);
        return;
      }

      if (
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
      ) {
        const supabase = createClient();
        const productPayload = {
          business_id: businessId,
          category_id: categoryId,
          name: name.trim(),
          description: description.trim(),
          price: numPrice,
          compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
          image_url: imageUrl,
          available: isAvailable,
          featured: isFeatured,
          updated_at: new Date().toISOString(),
        };

        if (editingProductId) {
          const { error: err } = await supabase
            .from('products')
            .update(productPayload)
            .eq('id', editingProductId);

          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await supabase.from('products').insert([productPayload]);
          if (err) throw new Error(err.message);
        }
      }

      await loadData();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto del menú?')) return;
    try {
      await ProductRepository.softDeleteProduct(productId);
      await loadData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'all' || p.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-rose-500" />
              <span>Gestión de Productos</span>
            </h1>
            <p className="text-xs text-zinc-400">
              Administra el menú, genera imágenes profesionales de tus productos con IA y controla productos agotados.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-300 font-bold focus:outline-none focus:border-rose-500"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Error notification */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={loadData} className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg">
              Reintentar
            </button>
          </div>
        )}

        {/* Products List */}
        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Cargando catálogo...</div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((prod) => {
              const categoryName = categories.find((c) => c.id === prod.categoryId)?.name || 'Sin categoría';

              return (
                <div
                  key={prod.id}
                  className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <img
                      src={prod.image}
                      alt={prod.name}
                      className="w-16 h-16 rounded-xl object-cover border border-zinc-800 shrink-0"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-zinc-100 truncate">{prod.name}</h4>
                        <span className="text-[10px] bg-zinc-950 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-800">
                          {categoryName}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-1">{prod.description}</p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-sm font-black text-amber-400">${prod.price.toFixed(2)}</span>
                        {prod.compareAtPrice && (
                          <span className="text-xs text-zinc-500 line-through">
                            ${prod.compareAtPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleToggleAvailability(prod.id, prod.isAvailable)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        prod.isAvailable
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : 'bg-rose-950 border-rose-800 text-rose-400'
                      }`}
                    >
                      {prod.isAvailable ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      <span>{prod.isAvailable ? 'Disponible' : 'Agotado'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(prod)}
                      className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="p-2 rounded-xl bg-zinc-950 hover:bg-rose-950/60 border border-zinc-800 hover:border-rose-800 text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Product Form Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-extrabold text-lg text-white">
                  {editingProductId ? 'Editar Producto' : 'Nuevo Producto'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-4">
                {/* Image upload & fal.ai AI generation */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Fotografía del Producto
                  </label>

                  <div className="flex items-center gap-4">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="w-24 h-24 rounded-2xl object-cover border border-zinc-800 bg-zinc-950 shrink-0"
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-200 cursor-pointer transition-all">
                          <Upload className="w-4 h-4 text-rose-400" />
                          <span>{uploadingImage ? 'Subiendo...' : 'Subir Imagen'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={handleOpenAiGenerator}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-extrabold text-xs shadow-md transition-all"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Generar con IA</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Sube una foto propia o genera una imagen profesional de tu platillo con IA.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Taco Birria Especial"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Categoría *
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Precio de Venta ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="3.50"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Precio Anterior / Tachado ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="4.00"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Descripción
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descripción apetitosa del producto..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAvailable}
                      onChange={(e) => setIsAvailable(e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Disponible en tienda</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                      className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Destacado (Popular)</span>
                  </label>
                </div>

                {formError && (
                  <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-xl active:scale-95 disabled:opacity-50 transition-all text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando producto...' : 'Guardar Producto'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* fal.ai AI Image Generation Modal */}
        {isAiModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-zinc-900 border border-purple-500/40 rounded-3xl p-6 space-y-5 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500" />

              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h3 className="font-extrabold text-base text-white">Generar Fotografía con IA</h3>
                </div>
                <button
                  onClick={() => setIsAiModalOpen(false)}
                  disabled={generatingAi}
                  className="p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <label className="block font-bold text-zinc-300 uppercase tracking-wider">
                  Prompt Descriptivo del Platillo
                </label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ej: Taco Birria artesanal con queso oaxaca fundido, cebolla picada y consomé calientito en plato de barro..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500">
                  Describe tu platillo y la IA genera una fotografía gastronómica lista para el menú.
                </p>
              </div>

              {aiError && (
                <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateAiImage}
                disabled={generatingAi || !aiPrompt.trim()}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-xl shadow-purple-950/50 active:scale-95 disabled:opacity-50 transition-all text-sm"
              >
                {generatingAi ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generando imagen fotorrealista...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <span>Generar Fotografía IA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
