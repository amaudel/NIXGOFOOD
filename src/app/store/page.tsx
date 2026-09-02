'use client';

import React, { useState } from 'react';
import { Hero } from '@/components/Hero';
import { CategoryNav } from '@/components/CategoryNav';
import { ProductCard } from '@/components/ProductCard';
import { useApp } from '@/context/AppContext';
import { Product } from '@/types';

export default function Home() {
  const { categories, products, openProductModal, addToCart } = useApp();
  const [activeCategoryId, setActiveCategoryId] = useState<string>('cat_tacos');

  const handleSelectCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    const categoryEl = document.getElementById(`category-${categoryId}`);
    if (categoryEl) {
      const yOffset = -130;
      const y = categoryEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <Hero />

      {/* Categories Sticky Horizontal Bar */}
      <div id="menu-section">
        <CategoryNav
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* Menu Products Grid */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-12">
        {categories.map((cat) => {
          const categoryProducts = products.filter((p) => p.categoryId === cat.id);

          if (categoryProducts.length === 0) return null;

          return (
            <section
              key={cat.id}
              id={`category-${cat.id}`}
              className="space-y-4 scroll-mt-36"
            >
              {/* Category Header */}
              <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
                <span className="text-2xl sm:text-3xl">{cat.icon}</span>
                <div>
                  <h3 className="font-extrabold text-xl sm:text-2xl text-white">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-zinc-400 font-medium">
                    {categoryProducts.length} {categoryProducts.length === 1 ? 'opción disponible' : 'opciones disponibles'}
                  </p>
                </div>
              </div>

              {/* Grid of Product Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {categoryProducts.map((prod: Product) => (
                  <ProductCard
                    key={prod.id}
                    product={prod}
                    onSelect={(p) => openProductModal(p)}
                    onQuickAdd={(p) =>
                      addToCart({
                        product: p,
                        quantity: 1,
                        selectedModifiers: [],
                        notes: '',
                        unitPrice: p.price,
                        totalPrice: p.price,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
