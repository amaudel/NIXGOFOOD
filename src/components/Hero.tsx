'use client';

import React from 'react';
import { Star, Clock, MapPin, ArrowDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { demoBusiness } from '@/data/demoSeed';

export const Hero: React.FC = () => {
  const { products } = useApp();

  const scrollToMenu = () => {
    const el = document.getElementById('menu-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Find taco birria for star dish showcase
  const starProduct = products.find((p) => p.slug === 'taco-birria' || p.id === 'p_taco_birria');
  const starImage = starProduct?.image || '/demo/products/taco-birria.webp';
  const coverImage = demoBusiness.coverImage || '/demo/hero/hero-main.webp';

  return (
    <section className="relative bg-zinc-950 text-white overflow-hidden border-b border-zinc-800/80">
      {/* Background Graphic Blur Overlay */}
      <div className="absolute inset-0 z-0 opacity-40">
        <img
          src={coverImage}
          alt="Gastronomía El Taca Nijo"
          className="w-full h-full object-cover filter blur-sm scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 sm:py-16 md:py-20 flex flex-col md:flex-row items-center justify-between gap-8">
        {/* Left Column: Text & CTA */}
        <div className="w-full md:w-1/2 space-y-5 text-center md:text-left">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-semibold backdrop-blur-md">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            <span>{demoBusiness.rating} ★ ({demoBusiness.reviewCount} opiniones) · Sabor Auténtico</span>
          </div>

          {/* Main Hero Title */}
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-white drop-shadow-md">
            Sabor que provoca <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-amber-400">volver</span>
          </h2>

          <p className="text-zinc-300 text-sm sm:text-base max-w-lg mx-auto md:mx-0 font-normal leading-relaxed">
            {demoBusiness.description}
          </p>

          {/* Info Pills */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-zinc-300 pt-1">
            <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>{demoBusiness.openingHours}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>Cuenca · Delivery activo</span>
            </div>
          </div>

          {/* CTA Button */}
          <div className="pt-2">
            <button
              onClick={scrollToMenu}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold text-base px-8 py-3.5 rounded-2xl shadow-xl shadow-rose-950/50 hover:shadow-rose-900/60 active:scale-95 transition-all"
            >
              <span>Pedir ahora</span>
              <ArrowDown className="w-5 h-5 animate-bounce" />
            </button>
          </div>
        </div>

        {/* Right Column: Hero Image Showcase (Plato Estrella) */}
        <div className="w-full md:w-1/2 flex justify-center">
          <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden border-2 border-zinc-700/60 shadow-2xl shadow-rose-950/40 group">
            <img
              src={starImage}
              alt="Plato estrella El Taca Nijo"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/90 backdrop-blur-md p-3.5 rounded-2xl border border-zinc-700/80 flex items-center justify-between">
              <div>
                <p className="text-xs text-rose-400 font-bold uppercase tracking-wider">Especialidad de la Casa</p>
                <p className="text-sm font-bold text-white">{starProduct?.name || 'Taco Birria con Consomé'}</p>
              </div>
              <span className="text-base font-extrabold text-amber-400 bg-amber-950/60 px-3 py-1 rounded-xl border border-amber-500/40">
                ${starProduct?.price?.toFixed(2) || '3.50'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
