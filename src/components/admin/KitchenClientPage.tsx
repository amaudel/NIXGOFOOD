'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { useBranch } from '@/context/BranchContext';
import { Order, OrderStatus } from '@/types';
import { OrderRepository } from '@/repositories/OrderRepository';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { KdsOrderElapsedTime } from '@/components/admin/KdsOrderElapsedTime';
import { OrderItemsList } from '@/components/admin/OrderItemsList';
import { NewOrderAlertBanner } from '@/components/admin/NewOrderAlertBanner';
import { UndoToastNotification, ActiveUndoToast } from '@/components/admin/UndoToastNotification';

export default function KitchenClientPage() {
  const { executeOrderAction } = useApp();
  const { selectedBranch, loading: branchLoading } = useBranch();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Unreviewed / New comanda alerts
  const [unreviewedOrderIds, setUnreviewedOrderIds] = useState<string[]>([]);
  const previousOrderCountRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Undo Toast state
  const [activeUndoToast, setActiveUndoToast] = useState<ActiveUndoToast | null>(null);

  const isDemo = isDemoMode();

  // Play WebAudio alarm chime for new comandas
  const triggerNewOrderAlert = () => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio play prevented:', e);
    }
  };

  const loadOrders = async () => {
    try {
      setError(null);
      const fetched = await OrderRepository.getOrders(CURRENT_BUSINESS_ID, selectedBranch?.id);

      // KDS Sorting: OLDEST FIRST (created_at ASC)
      const sorted = [...fetched].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Detect new incoming orders for sound chime
      if (previousOrderCountRef.current > 0 && sorted.length > previousOrderCountRef.current) {
        const newlyAdded = sorted.filter(
          (o) => o.status === 'new' && !unreviewedOrderIds.includes(o.id)
        );
        if (newlyAdded.length > 0) {
          triggerNewOrderAlert();
          setUnreviewedOrderIds((prev) => [...prev, ...newlyAdded.map((o) => o.id)]);
        }
      }
      previousOrderCountRef.current = sorted.length;

      setOrders(sorted);
    } catch (e: any) {
      console.error('Error loading kitchen orders:', e);
      setError('Error al cargar comandas de cocina.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (branchLoading) return;

    loadOrders();

    if (isDemo) {
      const unsubscribe = DemoBroadcastService.subscribe((event) => {
        const eventBranchId = (event?.payload as any)?.branchId;
        if (selectedBranch && eventBranchId && eventBranchId !== selectedBranch.id) return;
        if (event?.type === 'NEW_ORDER_CREATED') {
          triggerNewOrderAlert();
        }
        loadOrders();
      });
      return () => unsubscribe();
    } else {
      const supabase = createClient();
      const channel = supabase
        .channel('kitchen_kds_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            const branchIdEvento = (payload.new as any)?.branch_id ?? (payload.old as any)?.branch_id;
            if (selectedBranch && branchIdEvento && branchIdEvento !== selectedBranch.id) return;
            if (payload.eventType === 'INSERT') {
              triggerNewOrderAlert();
            }
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isDemo, selectedBranch?.id, branchLoading]);

  // Operational action transitions strictly for Kitchen
  const handleKitchenAction = async (
    orderId: string,
    action: 'KITCHEN_START' | 'KITCHEN_READY',
    currentStatus: OrderStatus,
    targetStatus: OrderStatus
  ) => {
    try {
      acknowledgeOrder(orderId);
      await executeOrderAction({
        orderId,
        action,
        expectedFromStatus: currentStatus,
      });

      // Trigger 5-second Undo toast
      setActiveUndoToast({
        orderId,
        orderNumber: orders.find((o) => o.id === orderId)?.orderNumber || '#',
        fromStatus: currentStatus,
        toStatus: targetStatus,
        timestamp: Date.now(),
      });

      await loadOrders();
    } catch (err: any) {
      console.error('Failed to execute kitchen order action:', err);
      alert(err.message || 'Error al actualizar la comanda.');
    }
  };

  // Undo action
  const handleUndo = async (toast: ActiveUndoToast) => {
    try {
      await OrderRepository.rollbackOrderStatus({
        orderId: toast.orderId,
        expectedCurrentStatus: toast.toStatus,
        targetStatus: toast.fromStatus,
        reason: 'Deshacer inmediato en Cocina',
      });
      setActiveUndoToast(null);
      await loadOrders();
    } catch (err: any) {
      console.error('Undo failed:', err);
      alert(err.message || 'No se pudo deshacer la acción.');
    }
  };

  const acknowledgeOrder = (orderId: string) => {
    setUnreviewedOrderIds((prev) => prev.filter((id) => id !== orderId));
  };

  // Filter orders into active kitchen groups
  const newOrders = orders.filter((o) => o.status === 'new');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  const renderKitchenCard = (ord: Order) => {
    const isUnreviewed = unreviewedOrderIds.includes(ord.id);
    const isPaid =
      ord.paymentMethod === 'cash' ||
      ord.transferDetails?.verificationStatus === 'verified';

    return (
      <div
        key={ord.id}
        onClick={() => acknowledgeOrder(ord.id)}
        className={`relative bg-zinc-900 border rounded-3xl p-5 space-y-4 shadow-xl transition-all duration-300 ${
          isUnreviewed
            ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/40 animate-pulse'
            : ord.status === 'new'
            ? 'border-rose-800/80 hover:border-rose-600'
            : ord.status === 'preparing'
            ? 'border-amber-800/80 hover:border-amber-600'
            : 'border-blue-800/80 hover:border-blue-600'
        }`}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">{ord.orderNumber}</span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                  ord.deliveryMethod === 'pickup'
                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {ord.deliveryMethod === 'pickup' ? 'RETIRO LOCAL' : 'DELIVERY'}
              </span>
            </div>
            <span className="text-xs text-zinc-400 font-medium block mt-1">
              <Clock className="w-3 h-3 inline mr-1 text-zinc-500" />
              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Compact Payment Badge */}
          <div className="text-right">
            <span
              className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                isPaid
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              {isPaid ? '✅ PAGO OK' : '🟡 PAGO PENDIENTE'}
            </span>
          </div>
        </div>

        {/* KDS Operational Timer */}
        <div>
          <KdsOrderElapsedTime
            createdAt={ord.createdAt}
            status={ord.status}
            deliveryMethod={ord.deliveryMethod}
          />
        </div>

        {/* Order Items & Modifiers */}
        <div className="bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-850">
          <OrderItemsList items={ord.items} notes={ord.notes} compact={true} />
        </div>

        {/* Primary Kitchen Action Buttons */}
        <div>
          {ord.status === 'new' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleKitchenAction(ord.id, 'KITCHEN_START', 'new', 'preparing');
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 font-black text-zinc-950 text-sm shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <ChefHat className="w-5 h-5" />
              EMPEZAR PREPARACIÓN
            </button>
          )}

          {ord.status === 'preparing' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleKitchenAction(ord.id, 'KITCHEN_READY', 'preparing', 'ready');
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-400 hover:to-emerald-400 font-black text-zinc-950 text-sm shadow-lg shadow-blue-950/40 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              MARCAR LISTO
            </button>
          )}

          {ord.status === 'ready' && (
            <div className="w-full py-3 px-4 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-black flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>✅ LISTO PARA EXPEDICIÓN</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Floating Alarms & Notifications */}
        <NewOrderAlertBanner />

        <UndoToastNotification
          toast={activeUndoToast}
          onUndo={handleUndo}
          onDismiss={() => setActiveUndoToast(null)}
        />

        {/* Header Control Panel */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 p-4 sm:p-5 rounded-3xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-zinc-950 shadow-lg shadow-amber-950/50">
              <ChefHat className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                PANTALLA DE COCINA KDS
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                  MODO OPERATIVO
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Comandas ordenadas por antigüedad (Más antiguas primero).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2.5 rounded-xl border transition-all ${
                soundEnabled
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
              title={soundEnabled ? 'Alertas sonoras activas' : 'Alertas sonoras silenciadas'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={loadOrders}
              className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-all"
              title="Refrescar comisiones"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-extrabold text-xs flex items-center justify-center gap-2 transition-all"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-amber-400" />
                  <span>Salir Pantalla Completa</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-amber-400" />
                  <span>Modo Monitor KDS</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-950/80 border border-rose-600/60 rounded-2xl text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* KDS Columns Layout */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-extrabold">Cargando comisiones de cocina...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: NEW (Sin Aceptar) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-rose-950/40 border border-rose-800/60 p-3.5 rounded-2xl">
                <h2 className="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  NUEVOS (SIN ACEPTAR)
                </h2>
                <span className="w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center">
                  {newOrders.length}
                </span>
              </div>
              {newOrders.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/40 border border-zinc-850 rounded-2xl text-xs text-zinc-500 font-medium">
                  No hay comandas nuevas
                </div>
              ) : (
                newOrders.map(renderKitchenCard)
              )}
            </div>

            {/* Column 2: PREPARING */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-2xl">
                <h2 className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  EN PREPARACIÓN
                </h2>
                <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-black text-xs flex items-center justify-center">
                  {preparingOrders.length}
                </span>
              </div>
              {preparingOrders.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/40 border border-zinc-850 rounded-2xl text-xs text-zinc-500 font-medium">
                  No hay comandas en preparación
                </div>
              ) : (
                preparingOrders.map(renderKitchenCard)
              )}
            </div>

            {/* Column 3: READY (Listos para Expedición) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-950/40 border border-blue-800/60 p-3.5 rounded-2xl">
                <h2 className="text-xs font-black text-blue-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  LISTOS PARA RETIRO / DELIVERY
                </h2>
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  {readyOrders.length}
                </span>
              </div>
              {readyOrders.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/40 border border-zinc-850 rounded-2xl text-xs text-zinc-500 font-medium">
                  No hay comandas listas
                </div>
              ) : (
                readyOrders.map(renderKitchenCard)
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
