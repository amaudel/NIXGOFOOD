'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  ChefHat,
  UtensilsCrossed,
  Settings,
  Truck,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OrderRepository } from '@/repositories/OrderRepository';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { createClient } from '@/lib/supabase/client';
import { Order } from '@/types';
import { useBranch } from '@/context/BranchContext';
import { useApp } from '@/context/AppContext';

export default function DashboardClientPage() {
  const router = useRouter();
  const { businessId, isDemo } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedBranch, loading: branchLoading } = useBranch();

  useEffect(() => {
    if (branchLoading) return;

    const checkRoleAndLoad = async () => {
      try {
        if (!isDemo) {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single();

            // Operator role is strictly focused on Kitchen KDS
            if (profile && profile.role === 'operator') {
              router.replace('/admin/kitchen');
              return;
            }
          }
        }

        const data = await OrderRepository.getOrders(businessId, selectedBranch?.id);
        setOrders(data);
      } catch (e) {
        console.error('Dashboard load error:', e);
      } finally {
        setLoading(false);
      }
    };

    checkRoleAndLoad();
  }, [isDemo, router, selectedBranch?.id, branchLoading, businessId]);

  const activeOrders = orders.filter(
    (o) => o.status === 'new' || o.status === 'preparing' || o.status === 'ready' || o.status === 'on_the_way'
  );
  const newOrdersCount = orders.filter((o) => o.status === 'new').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-500/20 p-6 sm:p-8 rounded-3xl backdrop-blur-md space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-500 text-zinc-950 font-black text-xs">
              PANEL RESUMEN
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            NixgoFood Administrador
          </h1>
          <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
            Bienvenido al centro de control. Selecciona el área operacional deseada para comenzar a trabajar.
          </p>
        </div>

        {/* Operational Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Caja & Pedidos */}
          <Link
            href="/admin/orders"
            className="group relative bg-zinc-900 border border-zinc-800 hover:border-amber-500 p-6 sm:p-8 rounded-3xl space-y-5 shadow-xl transition-all duration-300 hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <span className="text-xs font-bold text-zinc-500 flex items-center gap-1 group-hover:text-amber-400 transition-colors">
                Abrir Caja <ArrowRight className="w-4 h-4" />
              </span>
            </div>

            <div>
              <h2 className="text-xl font-black text-white group-hover:text-amber-400 transition-colors">
                💼 Caja / Gestor de Pedidos
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Verificación de transferencias, datos completos de cliente, seguimiento de entregas, búsqueda e historial.
              </p>
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-zinc-850 text-xs text-zinc-400">
              <span>
                Total Activos: <strong className="text-white">{activeOrders.length}</strong>
              </span>
              <span>
                Nuevos: <strong className="text-amber-400">{newOrdersCount}</strong>
              </span>
            </div>
          </Link>

          {/* Card 2: Cocina KDS */}
          <Link
            href="/admin/kitchen"
            className="group relative bg-zinc-900 border border-zinc-800 hover:border-rose-500 p-6 sm:p-8 rounded-3xl space-y-5 shadow-xl transition-all duration-300 hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
                <ChefHat className="w-8 h-8" />
              </div>
              <span className="text-xs font-bold text-zinc-500 flex items-center gap-1 group-hover:text-rose-400 transition-colors">
                Abrir Cocina <ArrowRight className="w-4 h-4" />
              </span>
            </div>

            <div>
              <h2 className="text-xl font-black text-white group-hover:text-rose-400 transition-colors">
                👨‍🍳 Pantalla de Cocina (KDS)
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Vista rápida optimizada para monitores de preparación. Timer de demora, alarmas sonoras y tarjetas simplificadas.
              </p>
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-zinc-850 text-xs text-zinc-400">
              <span>
                En Preparación: <strong className="text-rose-400">{preparingCount}</strong>
              </span>
              <span>
                Antigüedad: <strong className="text-white">ASC (Más antiguos primero)</strong>
              </span>
            </div>
          </Link>
        </div>

        {/* Management Quick Navigation */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
          <h3 className="text-sm font-extrabold text-white tracking-wide uppercase">
            Herramientas Administrativas
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Link
              href="/admin/menu/products"
              className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 font-extrabold flex items-center gap-3 transition-all"
            >
              <UtensilsCrossed className="w-5 h-5 text-amber-400" />
              <span>Productos</span>
            </Link>

            <Link
              href="/admin/delivery"
              className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 font-extrabold flex items-center gap-3 transition-all"
            >
              <Truck className="w-5 h-5 text-purple-400" />
              <span>Delivery</span>
            </Link>

            <Link
              href="/admin/hours"
              className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 font-extrabold flex items-center gap-3 transition-all"
            >
              <Clock className="w-5 h-5 text-blue-400" />
              <span>Horarios</span>
            </Link>

            <Link
              href="/admin/settings/business"
              className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 font-extrabold flex items-center gap-3 transition-all"
            >
              <Settings className="w-5 h-5 text-emerald-400" />
              <span>Configuración</span>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
