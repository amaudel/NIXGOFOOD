'use client';

import React, { useState, useEffect } from 'react';
import {
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Truck,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { useBranch } from '@/context/BranchContext';
import { Order, OrderStatus } from '@/types';
import { OrderRepository } from '@/repositories/OrderRepository';
import { DispatchCheckRepository } from '@/repositories/DispatchCheckRepository';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { KdsOrderElapsedTime } from '@/components/admin/KdsOrderElapsedTime';
import { OrderItemsList } from '@/components/admin/OrderItemsList';
import { UndoToastNotification, ActiveUndoToast } from '@/components/admin/UndoToastNotification';
import { DeliveryLocationActions } from '@/components/admin/DeliveryLocationActions';
import {
  DispatchChecklist,
  ChecklistState,
  isChecklistComplete,
} from '@/components/admin/DispatchChecklist';

export default function DispatchClientPage() {
  const { executeOrderAction } = useApp();
  const { selectedBranch, loading: branchLoading } = useBranch();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ready' | 'on_the_way'>('ready');
  const [activeUndoToast, setActiveUndoToast] = useState<ActiveUndoToast | null>(null);

  // Delivery confirmation modal state
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);

  // Per-order persisted checklist state tracking across devices
  const [checklists, setChecklists] = useState<Record<string, ChecklistState>>({});
  // Timestamps when order entered 'ready' status (fetched from order_status_history)
  const [readyTimestamps, setReadyTimestamps] = useState<Record<string, string>>({});
  // Expanded customer details toggle
  const [expandedCustomerDetails, setExpandedCustomerDetails] = useState<Record<string, boolean>>({});

  const isDemo = isDemoMode();

  const loadData = async () => {
    try {
      setError(null);
      const [fetchedOrders, fetchedChecks] = await Promise.all([
        OrderRepository.getOrders(CURRENT_BUSINESS_ID, selectedBranch?.id),
        DispatchCheckRepository.getChecks(CURRENT_BUSINESS_ID),
      ]);

      // Dispatch Sorting: OLDEST FIRST (created_at ASC) for priority departure
      const sorted = [...fetchedOrders].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setOrders(sorted);
      setChecklists(fetchedChecks);

      // Fetch accurate 'ready' transition timestamps from order_status_history
      if (!isDemo) {
        try {
          const readyOrderIds = sorted.filter((o) => o.status === 'ready').map((o) => o.id);
          if (readyOrderIds.length > 0) {
            const supabase = createClient();
            const { data: historyData } = await supabase
              .from('order_status_history')
              .select('order_id, created_at')
              .eq('to_status', 'ready')
              .in('order_id', readyOrderIds)
              .order('created_at', { ascending: false });

            if (historyData) {
              const map: Record<string, string> = {};
              historyData.forEach((row) => {
                if (!map[row.order_id]) {
                  map[row.order_id] = row.created_at;
                }
              });
              setReadyTimestamps(map);
            }
          }
        } catch (hErr) {
          console.warn('Failed to fetch ready status history timestamps:', hErr);
        }
      }
    } catch (e: any) {
      console.error('Error loading dispatch data:', e);
      setError('Error al cargar comandas de expedición.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchLoading) {
      loadData();
    }

    // Backup poll: guarantees the dispatch board picks up new/updated orders
    // even if the realtime/broadcast subscription below never fires.
    const pollInterval = setInterval(loadData, 20000);

    if (isDemo) {
      const unsubscribe = DemoBroadcastService.subscribe((msg) => {
        const eventBranchId = (msg?.payload as any)?.branchId;
        if (selectedBranch && eventBranchId && eventBranchId !== selectedBranch.id) return;
        loadData();
      });
      const handleDemoUpdate = () => loadData();
      window.addEventListener('nixgofood_demo_storage_change', handleDemoUpdate);
      return () => {
        clearInterval(pollInterval);
        unsubscribe();
        window.removeEventListener('nixgofood_demo_storage_change', handleDemoUpdate);
      };
    } else {
      const supabase = createClient();

      const ordersChannel = supabase
        .channel('dispatch_orders_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            const branchIdEvento = (payload.new as any)?.branch_id ?? (payload.old as any)?.branch_id;
            if (selectedBranch && branchIdEvento && branchIdEvento !== selectedBranch.id) return;
            loadData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_dispatch_checks' },
          () => {
            loadData();
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Dispatch Realtime] subscription failed:', status, err);
          }
        });

      return () => {
        clearInterval(pollInterval);
        supabase.removeChannel(ordersChannel);
      };
    }
  }, [isDemo, selectedBranch?.id, branchLoading]);

  const handleToggleChecklist = async (orderId: string, key: keyof ChecklistState) => {
    const current = checklists[orderId] || { complete: false, packaging: false };
    const nextChecks = { ...current, [key]: !current[key] };
    setChecklists((prev) => ({ ...prev, [orderId]: nextChecks }));

    await DispatchCheckRepository.toggleCheck(
      CURRENT_BUSINESS_ID,
      orderId,
      key,
      current
    );
  };

  const toggleCustomerDetails = (orderId: string) => {
    setExpandedCustomerDetails((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const handleDispatchAction = async (
    order: Order,
    action: 'DISPATCH_DELIVERY' | 'DISPATCH_PICKUP' | 'DISPATCH_CONFIRM_DELIVERY',
    targetStatus: OrderStatus,
    actionReason: string
  ) => {
    try {
      await executeOrderAction({
        orderId: order.id,
        action,
        expectedFromStatus: order.status,
        reason: actionReason,
      });

      setActiveUndoToast({
        orderId: order.id,
        orderNumber: order.orderNumber,
        fromStatus: order.status,
        toStatus: targetStatus,
        timestamp: Date.now(),
      });

      await loadData();
    } catch (err: any) {
      console.error('Failed to dispatch order:', err);
      alert(err.message || 'Error al procesar el despacho del pedido.');
    }
  };

  const handleUndo = async (toast: ActiveUndoToast) => {
    try {
      await OrderRepository.rollbackOrderStatus({
        orderId: toast.orderId,
        expectedCurrentStatus: toast.toStatus,
        targetStatus: toast.fromStatus,
        reason: 'Deshacer inmediato en Despacho',
      });
      setActiveUndoToast(null);
      await loadData();
    } catch (err: any) {
      console.error('Dispatch undo failed:', err);
      alert(err.message || 'No se pudo deshacer el despacho.');
    }
  };

  const readyOrders = orders.filter((o) => o.status === 'ready');
  const onTheWayOrders = orders.filter((o) => o.status === 'on_the_way');

  const displayedOrders = activeTab === 'ready' ? readyOrders : onTheWayOrders;

  const renderDispatchCard = (ord: Order) => {
    const isPickup = ord.deliveryMethod === 'pickup';

    // PAYMENT POLICY AUDIT RULE:
    // Cash: ALLOWED
    // Transfer Verified: ALLOWED
    // Transfer Pending: BLOCKED
    // Transfer Rejected: BLOCKED
    const isCash = ord.paymentMethod === 'cash';
    const isVerified = ord.transferDetails?.verificationStatus === 'verified';
    const isPaymentRejected = ord.transferDetails?.verificationStatus === 'rejected';
    const isPaymentPending = !isCash && ord.transferDetails?.verificationStatus === 'pending';

    const paymentAllowsDispatch = isCash || isVerified;

    const checklistState = checklists[ord.id] || { complete: false, packaging: false };
    const checklistComplete = isChecklistComplete(ord.items, checklistState);

    // CENTRALIZED DISPATCH RULE
    const canDispatch =
      ord.status === 'ready' &&
      checklistComplete &&
      paymentAllowsDispatch;

    const isCustomerExpanded = expandedCustomerDetails[ord.id];
    const readyAtTimestamp = readyTimestamps[ord.id];

    return (
      <div
        key={ord.id}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl hover:border-zinc-700 transition-all"
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">{ord.orderNumber}</span>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  isPickup
                    ? 'bg-purple-950 text-purple-300 border-purple-800'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {isPickup ? '🏪 RETIRO EN LOCAL' : '🛵 DELIVERY'}
              </span>
            </div>
            <span className="text-xs text-zinc-400 font-medium block mt-1">
              <Clock className="w-3 h-3 inline mr-1 text-zinc-500" />
              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Compact Payment Status */}
          <div className="text-right">
            <span
              className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${
                paymentAllowsDispatch
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : isPaymentRejected
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              {paymentAllowsDispatch
                ? '✅ PAGO OK'
                : isPaymentRejected
                ? '🔴 PAGO RECHAZADO'
                : '🟡 PAGO PENDIENTE'}
            </span>
          </div>
        </div>

        {/* Operational Timer with accurate readyAt timestamp */}
        <div>
          <KdsOrderElapsedTime
            createdAt={ord.createdAt}
            status={ord.status}
            deliveryMethod={ord.deliveryMethod}
            readyAt={readyAtTimestamp}
          />
        </div>

        {/* Customer Info Section */}
        <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-850 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-zinc-200">
            <span className="truncate">{ord.customer.name}</span>
            {!isPickup && ord.customer.phone && (
              <button
                type="button"
                onClick={() => toggleCustomerDetails(ord.id)}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold text-[11px] shrink-0"
              >
                <span>{isCustomerExpanded ? 'Ocultar datos' : 'Ver datos entrega'}</span>
                {isCustomerExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Location actions are always visible for delivery orders - this is the
              screen where staff hand off the address to the motorizado, so they
              shouldn't need an extra click to reach it. */}
          {!isPickup && ord.deliveryLocation && (
            <DeliveryLocationActions
              deliveryLocation={ord.deliveryLocation}
              customerName={ord.customer.name}
            />
          )}

          {!isPickup && isCustomerExpanded && (
            <div className="pt-2 border-t border-zinc-850 space-y-1.5 text-[11px] text-zinc-400">
              <p className="flex items-center gap-1 text-amber-300 font-bold">
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>{ord.customer.phone}</span>
              </p>
              {ord.deliveryLocation?.address && (
                <p className="leading-relaxed">
                  <MapPin className="w-3.5 h-3.5 inline mr-1 text-zinc-500" />
                  <span className="text-zinc-500 font-bold">Dirección: </span>
                  {ord.deliveryLocation.address}
                </p>
              )}
              {ord.deliveryLocation?.reference && (
                <p className="leading-relaxed">
                  <span className="text-zinc-500 font-bold">Ref: </span>
                  {ord.deliveryLocation.reference}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Order Items List */}
        <div className="bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-850">
          <OrderItemsList items={ord.items} notes={ord.notes} compact={true} />
        </div>

        {/* Dynamic Multi-device Dispatch Checklist */}
        {ord.status === 'ready' && (
          <DispatchChecklist
            items={ord.items}
            checkedState={checklistState}
            onToggle={(key) => handleToggleChecklist(ord.id, key)}
          />
        )}

        {/* Payment Warning Notice if Transfer Pending or Rejected */}
        {isPaymentPending && (
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-[11px] font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>🟡 Pago pendiente de verificación en Caja</span>
          </div>
        )}

        {isPaymentRejected && (
          <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-[11px] font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>🔴 Pago rechazado. Revisar en Caja.</span>
          </div>
        )}

        {/* Primary Action Button */}
        <div>
          {ord.status === 'ready' && (
            <button
              disabled={!canDispatch}
              onClick={(e) => {
                e.stopPropagation();
                if (isPickup) {
                  handleDispatchAction(ord, 'DISPATCH_PICKUP', 'delivered', 'Entregado al cliente en local');
                } else {
                  handleDispatchAction(ord, 'DISPATCH_DELIVERY', 'on_the_way', 'Entregado a repartidor de delivery');
                }
              }}
              className={`w-full py-4 px-4 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                canDispatch
                  ? isPickup
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-emerald-950/40 active:scale-95'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-amber-950/40 active:scale-95'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60 cursor-not-allowed opacity-60'
              }`}
            >
              {isPickup ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>✅ ENTREGADO AL CLIENTE</span>
                </>
              ) : (
                <>
                  <Truck className="w-5 h-5" />
                  <span>🛵 ENTREGAR A REPARTIDOR</span>
                </>
              )}
            </button>
          )}

          {ord.status === 'on_the_way' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeliveryOrder(ord);
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 font-black text-zinc-950 text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>MARCAR CONFIRMADO ENTREGADO</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <UndoToastNotification
          toast={activeUndoToast}
          onUndo={handleUndo}
          onDismiss={() => setActiveUndoToast(null)}
        />

        {/* Delivery Confirmation Modal */}
        {confirmDeliveryOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Confirmar Entrega de Delivery
                </h3>
                <button
                  onClick={() => setConfirmDeliveryOrder(null)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-zinc-300">
                <p>
                  ¿Confirmas que el pedido{' '}
                  <strong className="text-amber-400 font-black">
                    {confirmDeliveryOrder.orderNumber}
                  </strong>{' '}
                  para <strong className="text-white">{confirmDeliveryOrder.customer.name}</strong> fue entregado exitosamente al cliente?
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setConfirmDeliveryOrder(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const targetOrd = confirmDeliveryOrder;
                    setConfirmDeliveryOrder(null);
                    await handleDispatchAction(
                      targetOrd,
                      'DISPATCH_CONFIRM_DELIVERY',
                      'delivered',
                      'Confirmado entregado al cliente por despacho'
                    );
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-black text-xs shadow-lg shadow-emerald-950/40 transition-all"
                >
                  Sí, Confirmar Entrega
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header Control Panel */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center text-zinc-950 shadow-lg shadow-purple-950/50">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                📦 ESTACIÓN DE EXPEDICIÓN Y DESPACHO
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-bold uppercase">
                  EXPEDICIÓN
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Revisión física de empaque, bebidas, extras y entrega a repartidor o cliente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={loadData}
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
                  <Minimize2 className="w-4 h-4 text-purple-400" />
                  <span>Salir Pantalla Completa</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-purple-400" />
                  <span>Modo Despacho Monitor</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Selection Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('ready')}
            className={`h-10 px-4 rounded-xl font-extrabold text-xs whitespace-nowrap transition-all flex items-center gap-2 border ${
              activeTab === 'ready'
                ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-950/40'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <span>Por despachar</span>
            {readyOrders.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center animate-pulse shadow-sm">
                {readyOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('on_the_way')}
            className={`h-10 px-4 rounded-xl font-extrabold text-xs whitespace-nowrap transition-all flex items-center gap-2 border ${
              activeTab === 'on_the_way'
                ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-950/40'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <span>En camino ({onTheWayOrders.length})</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-950/80 border border-rose-600/60 rounded-2xl text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Orders Grid */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-extrabold">Cargando pedidos de expedición...</p>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-3">
            <Package className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-sm font-bold text-zinc-300">
              {activeTab === 'ready'
                ? 'No hay pedidos pendientes por despachar'
                : 'No hay pedidos actualmente en camino'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedOrders.map(renderDispatchCard)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
