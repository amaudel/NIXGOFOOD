'use client';

import React from 'react';
import { Plus, Flame, AlertCircle } from 'lucide-react';
import { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const isAvailable = product.isAvailable;

  return (
    <div
      onClick={() => isAvailable && onSelect(product)}
      className={`group relative bg-zinc-900 rounded-2xl border border-zinc-800/90 overflow-hidden flex flex-col justify-between transition-all duration-300 ${
        isAvailable
          ? 'hover:border-rose-500/50 hover:shadow-xl hover:shadow-rose-950/20 cursor-pointer hover:-translate-y-1'
          : 'opacity-65 grayscale-[30%] cursor-not-allowed'
      }`}
    >
      {/* Product Image & Badges */}
      <div>
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-950">
          <img
            src={product.image}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isAvailable ? 'group-hover:scale-105' : ''
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-80" />

          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start">
            {product.isPopular && isAvailable && (
              <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-rose-500 text-zinc-950 font-extrabold text-[11px] px-2.5 py-0.5 rounded-full shadow-md">
                <Flame className="w-3 h-3 fill-zinc-950" />
                Popular
              </span>
            )}
            {!isAvailable && (
              <span className="inline-flex items-center gap-1 bg-rose-950/90 border border-rose-600 text-rose-300 font-bold text-xs px-2.5 py-1 rounded-full shadow-md">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                Agotado
              </span>
            )}
          </div>

          {/* Price Tag Overlay */}
          <div className="absolute bottom-2.5 right-2.5 bg-zinc-950/90 backdrop-blur-md px-3 py-1 rounded-xl border border-zinc-700/80">
            <span className="text-amber-400 font-extrabold text-sm sm:text-base">
              ${product.price.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2">
          <h3 className="font-bold text-base text-zinc-100 group-hover:text-rose-400 transition-colors line-clamp-1">
            {product.name}
          </h3>
          <p className="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed font-normal">
            {product.description}
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4 pt-0">
        {isAvailable ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(product);
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border border-zinc-700 hover:border-rose-500 shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4 text-rose-400 group-hover:text-white" />
            <span>Agregar</span>
          </button>
        ) : (
          <div className="w-full text-center py-2 bg-zinc-950/60 rounded-xl border border-zinc-800 text-zinc-500 font-medium text-xs">
            No disponible hoy
          </div>
        )}
      </div>
    </div>
  );
};
