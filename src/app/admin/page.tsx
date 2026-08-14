'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Phone,
  ArrowRight,
  Check,
  RefreshCw,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { Order, OrderStatus } from '@/types';
import { OrderRepository } from '@/repositories/OrderRepository';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

export default function AdminOrdersPage() {
  const { updateOrderStatus } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('todos');

  const isDemo = isDemoMode();

  const fetchOrders = async () => {
    try {
      setError(null);
      const data = await OrderRepository.getOrders(CURRENT_BUSINESS_ID);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar pedidos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // BroadcastChannel subscription for Demo Mode multi-tab sync
    const unsubscribeBroadcast = DemoBroadcastService.subscribe((msg) => {
      if (msg.type === 'NEW_ORDER_CREATED' || msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'DEMO_RESET') {
        fetchOrders();
      }
    });

    // Supabase Realtime Subscription for Orders filtered by business_id (Only in Production mode)
    if (
      !isDemo &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-project.supabase.co' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
    ) {
      const supabase = createClient();
      const channel = supabase
        .channel('admin_orders_channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `business_id=eq.${CURRENT_BUSINESS_ID}`,
          },
          () => {
            fetchOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        unsubscribeBroadcast();
      };
    }

    return () => {
      unsubscribeBroadcast();
    };
  }, [isDemo]);

  const getNextStatus = (currentStatus: OrderStatus): { nextStatus: OrderStatus; buttonLabel: string } | null => {
    switch (currentStatus) {
      case 'new':
        return { nextStatus: 'preparing', buttonLabel: 'Aceptar pedido' };
      case 'preparing':
        return { nextStatus: 'ready', buttonLabel: 'Marcar como Listo' };
      case 'ready':
        return { nextStatus: 'on_the_way', buttonLabel: 'Enviar con Repartidor' };
      case 'on_the_way':
        return { nextStatus: 'delivered', buttonLabel: 'Marcar como Entregado' };
      case 'delivered':
      case 'cancelled':
        return null;
      default:
        return null;
    }
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, nextStatus);
      await fetchOrders();
    } catch (err: any) {
      alert(`Error al actualizar estado: ${err.message}`);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (selectedStatusFilter === 'todos') return true;
    if (selectedStatusFilter === 'activos') return o.status !== 'delivered' && o.status !== 'cancelled';
    return o.status === selectedStatusFilter;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Demo Mode Discreet Notice */}
        {isDemo && (
          <div className="bg-zinc-900 border border-amber-800/60 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>MODO DEMO ACTIVADO:</strong> Los pedidos y cambios administrativos se comparten dentro del almacenamiento local de este navegador.
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-white">Pedidos en Cocina</h1>
            <p className="text-xs text-zinc-400 font-medium">
              Gestión operativa de comandas y actualización de estados del pedido.
            </p>
          </div>

          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 px-4 py-2 rounded-xl border border-zinc-800 text-xs font-bold transition-all"
          >
            <RefreshCw className="w-4 h-4 text-rose-400" />
            <span>Refrescar</span>
          </button>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'activos', label: 'En curso' },
            { id: 'new', label: 'Nuevos' },
            { id: 'preparing', label: 'Preparando' },
            { id: 'ready', label: 'Listos' },
            { id: 'on_the_way', label: 'En camino' },
            { id: 'delivered', label: 'Entregados' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedStatusFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                selectedStatusFilter === f.id
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchOrders}
              className="px-3 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded-lg font-bold"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Orders Cards Grid */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-zinc-400">Cargando pedidos...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center space-y-3">
            <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto" />
            <h3 className="text-lg font-bold text-zinc-300">No hay pedidos en esta sección</h3>
            <p className="text-xs text-zinc-500">
              Los nuevos pedidos realizados por los clientes aparecerán automáticamente aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map((ord) => {
              const nextStep = getNextStatus(ord.status);

              return (
                <div
                  key={ord.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl flex flex-col justify-between hover:border-zinc-700 transition-all"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div>
                        <span className="text-lg font-black text-white">{ord.orderNumber}</span>
                        <span className="text-xs text-zinc-400 block font-medium">
                          <Clock className="w-3 h-3 inline mr-1 text-zinc-500" />
                          {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <span
                        className={`text-xs uppercase font-extrabold px-3 py-1 rounded-full border ${
                          ord.status === 'new'
                            ? 'bg-rose-950 text-rose-300 border-rose-700 animate-pulse'
                            : ord.status === 'preparing'
                            ? 'bg-amber-950 text-amber-300 border-amber-700'
                            : ord.status === 'ready'
                            ? 'bg-blue-950 text-blue-300 border-blue-700'
                            : ord.status === 'on_the_way'
                            ? 'bg-purple-950 text-purple-300 border-purple-700'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-850 space-y-1 text-xs">
                      <div className="flex items-center justify-between font-bold text-zinc-200">
                        <span>{ord.customer.name}</span>
                        <span className="text-amber-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {ord.customer.phone}
                        </span>
                      </div>

                      <div className="text-zinc-400 pt-0.5">
                        <span className="font-semibold text-rose-400">
                          {ord.deliveryMethod === 'delivery' ? '🛵 Delivery' : '🏪 Retiro en local'}
                        </span>
                        {ord.deliveryLocation && (
                          <p className="truncate text-zinc-500 pt-0.5">
                            📍 {ord.deliveryLocation.address} ({ord.deliveryLocation.reference})
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Itemized Order List */}
                    <div className="space-y-2 text-xs">
                      <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">
                        Productos ({ord.items.reduce((s, i) => s + i.quantity, 0)})
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                        {ord.items.map((it) => (
                          <div key={it.id} className="bg-zinc-950/60 p-2 rounded-xl border border-zinc-800/80">
                            <div className="flex justify-between font-bold text-zinc-200">
                              <span>
                                {it.quantity} × {it.productName}
                              </span>
                              <span className="text-amber-400">${it.totalPrice.toFixed(2)}</span>
                            </div>
                            {it.selectedModifiers.length > 0 && (
                              <p className="text-[10px] text-zinc-400 pt-0.5">
                                {it.selectedModifiers.map((m) => m.modifierName).join(', ')}
                              </p>
                            )}
                            {it.notes && (
                              <p className="text-[10px] text-amber-400 italic pt-0.5">&quot;{it.notes}&quot;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Action */}
                  <div className="pt-3 border-t border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between text-sm font-black text-white">
                      <span>Total del Pedido</span>
                      <span className="text-amber-400 text-base">${ord.total.toFixed(2)}</span>
                    </div>

                    {nextStep ? (
                      <button
                        onClick={() => handleStatusChange(ord.id, nextStep.nextStatus)}
                        className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3 px-4 rounded-2xl shadow-lg active:scale-95 transition-all text-xs sm:text-sm"
                      >
                        <span>{nextStep.buttonLabel}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="w-full text-center py-2.5 bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4" />
                        <span>Pedido completado</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
