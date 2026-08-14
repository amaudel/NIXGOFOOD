'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShoppingBag,
  UtensilsCrossed,
  Layers,
  Sliders,
  Truck,
  Clock,
  Settings,
  LogOut,
  ShieldCheck,
  Menu as MenuIcon,
  X,
  Home,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { businessConfig } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoStorage } from '@/repositories/demo/DemoStorage';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

const navItems = [
  { href: '/admin', label: 'Pedidos', icon: ShoppingBag },
  { href: '/admin/menu/products', label: 'Productos', icon: UtensilsCrossed },
  { href: '/admin/menu/categories', label: 'Categorías', icon: Layers },
  { href: '/admin/menu/modifiers', label: 'Modificadores', icon: Sliders },
  { href: '/admin/delivery', label: 'Delivery', icon: Truck },
  { href: '/admin/hours', label: 'Horarios', icon: Clock },
  { href: '/admin/settings/business', label: 'Configuración Negocio', icon: Settings },
];

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const isDemo = isDemoMode();

  const handleLogout = async () => {
    try {
      if (!isDemo) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
      router.push('/admin/login');
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetDemo = () => {
    DemoStorage.resetDemoData();
    DemoBroadcastService.notify('DEMO_RESET');
    setShowResetModal(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* Mobile Header Bar */}
      <div className="md:hidden sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
          <span className="font-extrabold text-sm text-white">{businessConfig.name}</span>
          {isDemo && (
            <span className="text-[10px] uppercase font-black tracking-wider bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full">
              Demo
            </span>
          )}
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 bottom-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800 p-5 flex flex-col justify-between transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Header Brand */}
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-md">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white">{businessConfig.name}</h2>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-950 px-2 py-0.5 rounded-full border border-rose-800">
                  Administración
                </span>
                {isDemo && (
                  <span className="text-[9px] uppercase font-black text-amber-300 bg-amber-950 px-1.5 py-0.5 rounded-full border border-amber-800">
                    DEMO
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md shadow-rose-950/40'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Actions */}
        <div className="space-y-2 border-t border-zinc-800 pt-4">
          {isDemo && (
            <button
              onClick={() => setShowResetModal(true)}
              className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-950/50 border border-amber-800/80 transition-all"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>Restaurar datos iniciales</span>
            </button>
          )}

          <Link
            href="/"
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-100 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <Home className="w-4 h-4 text-amber-400" />
            <span>Ver menú cliente</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-900 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content View */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto overflow-y-auto">{children}</main>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-zinc-900 border border-amber-500/40 rounded-3xl p-6 space-y-5 shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-950/80 border border-amber-700 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="font-extrabold text-lg text-white">¿Restaurar datos iniciales de la demo?</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Esto eliminará los cambios realizados en esta demo (productos creados, precios modificados y pedidos realizados) y restaurará los datos iniciales de El Taca Nijo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="w-full py-3 px-4 rounded-xl bg-zinc-950 border border-zinc-800 font-bold text-zinc-300 hover:text-white text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetDemo}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 font-extrabold text-zinc-950 text-xs shadow-lg"
              >
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
