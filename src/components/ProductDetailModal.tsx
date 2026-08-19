'use client';

import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, ShoppingBag, Check } from 'lucide-react';
import { Product, SelectedModifier } from '@/types';
import { useApp } from '@/context/AppContext';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const { addToCart } = useApp();

  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
  const [notes, setNotes] = useState('');

  // Reset modal internal state whenever target product changes
  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setNotes('');

    // Preselect defaults for required single-select modifier groups
    const defaultMods: SelectedModifier[] = [];
    product.modifierGroups?.forEach((grp) => {
      if (grp.required && grp.modifiers.length > 0) {
        defaultMods.push({
          groupId: grp.id,
          groupName: grp.name,
          modifierId: grp.modifiers[0].id,
          modifierName: grp.modifiers[0].name,
          price: grp.modifiers[0].price,
        });
      }
    });
    setSelectedModifiers(defaultMods);
  }, [product]);

  if (!product) return null;

  // Single choice group toggle (Radio button behavior)
  const handleSingleSelect = (groupId: string, groupName: string, modifierId: string, modifierName: string, price: number) => {
    setSelectedModifiers((prev) => {
      const filtered = prev.filter((m) => m.groupId !== groupId);
      return [...filtered, { groupId, groupName, modifierId, modifierName, price }];
    });
  };

  // Multi choice group toggle (Checkbox behavior)
  const handleMultiToggle = (groupId: string, groupName: string, modifierId: string, modifierName: string, price: number) => {
    setSelectedModifiers((prev) => {
      const exists = prev.some((m) => m.groupId === groupId && m.modifierId === modifierId);
      if (exists) {
        return prev.filter((m) => !(m.groupId === groupId && m.modifierId === modifierId));
      } else {
        return [...prev, { groupId, groupName, modifierId, modifierName, price }];
      }
    });
  };

  // Calculate live total price
  const modifiersPriceSum = selectedModifiers.reduce((acc, m) => acc + m.price, 0);
  const unitPrice = product.price + modifiersPriceSum;
  const totalPrice = unitPrice * quantity;

  // Check required groups
  const missingRequiredGroup = product.modifierGroups?.find((grp) => {
    if (!grp.required) return false;
    return !selectedModifiers.some((m) => m.groupId === grp.id);
  });

  const handleAdd = () => {
    if (missingRequiredGroup) return;

    addToCart({
      product,
      quantity,
      selectedModifiers,
      notes: notes.trim(),
      unitPrice,
      totalPrice,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden text-zinc-100 max-h-[90vh] flex flex-col">
        {/* Header Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 bg-zinc-950/80 text-zinc-300 hover:text-white p-2 rounded-full border border-zinc-700/60 backdrop-blur-md transition-all hover:scale-105"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Container */}
        <div className="overflow-y-auto flex-1 p-0 pb-6 no-scrollbar">
          {/* Hero Modal Image */}
          <div className="relative aspect-[16/9] w-full bg-zinc-950">
            <img
              src={product.image || 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80'}
              alt={product.name}
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80';
              }}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-90" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-black text-white drop-shadow-md">{product.name}</h2>
                <p className="text-amber-400 text-lg font-extrabold">${product.price.toFixed(2)} base</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="p-4 sm:p-6 space-y-6">
            <p className="text-zinc-300 text-sm leading-relaxed">{product.description}</p>

            {/* Modifier Groups */}
            {product.modifierGroups && product.modifierGroups.length > 0 && (
              <div className="space-y-6">
                {product.modifierGroups.map((grp) => {
                  const isSingleSelect = grp.required || grp.maxSelect === 1;

                  return (
                    <div key={grp.id} className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                          <span>{grp.name}</span>
                          {grp.required && (
                            <span className="text-[10px] uppercase font-extrabold text-rose-400 bg-rose-950/80 border border-rose-800 px-2 py-0.5 rounded-full">
                              Requerido
                            </span>
                          )}
                        </h4>
                        <span className="text-xs text-zinc-400 font-medium">
                          {isSingleSelect ? 'Elige 1 opción' : 'Opcional'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {grp.modifiers.map((mod) => {
                          const isSelected = selectedModifiers.some(
                            (m) => m.groupId === grp.id && m.modifierId === mod.id
                          );

                          return (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => {
                                if (isSingleSelect) {
                                  handleSingleSelect(grp.id, grp.name, mod.id, mod.name, mod.price);
                                } else {
                                  handleMultiToggle(grp.id, grp.name, mod.id, mod.name, mod.price);
                                }
                              }}
                              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-sm transition-all ${
                                isSelected
                                  ? 'bg-rose-950/40 border-rose-500 text-white shadow-md'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-rose-600 border-rose-500 text-white'
                                      : 'border-zinc-600 bg-zinc-950'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                                <span className="font-semibold">{mod.name}</span>
                              </div>
                              {mod.price > 0 && (
                                <span className="text-amber-400 font-bold text-xs">+${mod.price.toFixed(2)}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Special Instructions / Notes */}
            <div className="space-y-2">
              <label htmlFor="modal-notes" className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Observaciones especiales
              </label>
              <textarea
                id="modal-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Sin cebolla, salsa de ají aparte..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-4">
          {/* Quantity Controls */}
          <div className="flex items-center bg-zinc-900 rounded-xl border border-zinc-800 p-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-bold text-sm text-white">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add to Cart CTA */}
          <button
            onClick={handleAdd}
            disabled={!!missingRequiredGroup}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-rose-950/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 text-sm sm:text-base"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>
              {missingRequiredGroup ? 'Elige opciones obligatorias' : `Agregar al pedido · $${totalPrice.toFixed(2)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
