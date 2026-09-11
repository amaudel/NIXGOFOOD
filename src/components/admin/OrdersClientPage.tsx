'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Clock,
  Phone,
  Camera,
  X,
  XCircle,
  CheckCircle2,
  Undo2,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useApp } from '@/context/AppContext';
import { useBranch } from '@/context/BranchContext';
import { Order, OrderStatus, AdminRole, OrderStatusHistoryItem, Motorizado } from '@/types';
import { OrderRepository } from '@/repositories/OrderRepository';
import { getBusinessRepository } from '@/repositories/factory';
import { createClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/config/demo';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { OrderItemsList } from '@/components/admin/OrderItemsList';
import { NewOrderAlertBanner } from '@/components/admin/NewOrderAlertBanner';
import { useNewOrderAlerts } from '@/context/NewOrderAlertContext';
import { UndoToastNotification, ActiveUndoToast } from '@/components/admin/UndoToastNotification';
import { LiveChatHandoffDrawer } from '@/components/admin/LiveChatHandoffDrawer';
import { DeliveryLocationActions } from '@/components/admin/DeliveryLocationActions';
import { RollbackOrderModal as RollbackModal } from '@/components/admin/RollbackOrderModal';
import { OrderFilterBadge } from '@/components/admin/OrderFilterBadge';
import { ORDER_FILTERS, getOrderFilterCount } from '@/config/orderFilters';
import { OperationalClockProvider, useOperationalClock } from '@/context/OperationalClockContext';
import { getOrderSupervisionState } from '@/lib/orderSupervision';
import { DemoStorage } from '@/repositories/demo/DemoStorage';

const getStatusLabel = (s: OrderStatus): string => {
  switch (s) {
    case 'new':
      return 'NUEVO';
    case 'preparing':
      return 'EN PREPARACIÓN';
    case 'ready':
      return 'LISTO PARA EXPEDICIÓN';
    case 'on_the_way':
      return 'EN CAMINO';
    case 'delivered':
      return 'ENTREGADO';
    case 'cancelled':
      return 'CANCELADO';
    default:
      return s;
  }
};

// Groups delivered orders by calendar day using the actual delivery timestamp
// (from status history), falling back to the order's creation date when no
// 'delivered' history entry is found.
const getOrderDayKey = (order: Order, historyMap: Record<string, OrderStatusHistoryItem[]>): string => {
  const deliveredEntry = historyMap[order.id]?.find((h) => h.toStatus === 'delivered');
  const d = new Date(deliveredEntry?.createdAt || order.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDayLabel = (dayKey: string): string => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const longDate = date.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  if (sameDay(date, today)) return `Hoy · ${longDate}`;
  if (sameDay(date, yesterday)) return `Ayer · ${longDate}`;
  return date.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

function OrdersPageContent() {
  const { executeOrderAction, businessId } = useApp();
  const { selectedBranch, loading: branchLoading } = useBranch();
  const now = useOperationalClock();
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<string, OrderStatusHistoryItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingFocusOrderId, setPendingFocusOrderId] = useState<string | null>(null);

  // New-order detection: tracks every order id already seen so loadOrders can
  // alert on genuinely new orders regardless of how it was triggered (realtime,
  // demo broadcast, or the backup poll).
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  const { triggerNewOrderAlert } = useNewOrderAlerts();

  // Proof viewer modal
  const [selectedProofOrder, setSelectedProofOrder] = useState<Order | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Active 5-second Undo Toast state
  const [activeUndoToast, setActiveUndoToast] = useState<ActiveUndoToast | null>(null);

  // Administrative Rollback & Cancel Modals state
  const [rollbackModalOrder, setRollbackModalOrder] = useState<Order | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [userRole, setUserRole] = useState<AdminRole>('admin');
  const [motorizados, setMotorizados] = useState<Motorizado[]>([]);

  const isDemo = isDemoMode();

  useEffect(() => {
    if (branchLoading || !selectedBranch) return;
    getBusinessRepository()
      .getMotorizados(selectedBranch.id, businessId)
      .then(setMotorizados)
      .catch(() => setMotorizados([]));
  }, [selectedBranch?.id, branchLoading, businessId]);

  const loadOrders = async () => {
    try {
      setError(null);
      const data = await OrderRepository.getOrders(businessId, selectedBranch?.id);
      // Commercial Orders Sorting: NEWEST FIRST (created_at DESC)
      const sorted = [...data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sorted);

      // Seed the seen-orders set on initial load (0 alerts on page open), then
      // alert on every genuinely new order from then on — works regardless of
      // whether this load came from realtime, demo broadcast, or the backup poll.
      if (isInitialLoadRef.current) {
        sorted.forEach((o) => seenOrderIdsRef.current.add(o.id));
        isInitialLoadRef.current = false;
      } else {
        sorted
          .filter((o) => !seenOrderIdsRef.current.has(o.id))
          .forEach((o) => {
            seenOrderIdsRef.current.add(o.id);
            triggerNewOrderAlert(o);
          });
      }

      // Single Batch Query for Order History (No N+1)
      const orderIds = sorted.map((o) => o.id);
      if (orderIds.length > 0) {
        const hMap = await OrderRepository.getOrderStatusHistoryMap(orderIds);
        setHistoryMap(hMap);
      }
    } catch (e: any) {
      console.error('Error loading commercial orders:', e);
      setError('Error al cargar la lista de pedidos de caja.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleOrderHistory = async (orderId: string) => {
    try {
      const hList = await OrderRepository.getOrderStatusHistory(orderId);
      setHistoryMap((prev) => ({
        ...prev,
        [orderId]: hList,
      }));
    } catch (e) {
      console.error('Error fetching single order history:', e);
    }
  };

  useEffect(() => {
    if (!branchLoading) {
      loadOrders();
    }

    // Backup poll: guarantees the list picks up new/updated orders even if
    // the realtime/broadcast subscription below never fires.
    const pollInterval = setInterval(loadOrders, 20000);

    if (!isDemo) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
              if (data?.role) setUserRole(data.role as AdminRole);
            });
        }
      });
    }

    if (isDemo) {
      const unsubscribe = DemoBroadcastService.subscribe((msg) => {
        loadOrders();
        if (msg.payload?.orderId || msg.payload?.id) {
          fetchSingleOrderHistory(msg.payload.orderId || msg.payload.id);
        }
      });

      const handleDemoUpdate = () => loadOrders();
      window.addEventListener('nixgofood_demo_storage_change', handleDemoUpdate);
      return () => {
        clearInterval(pollInterval);
        unsubscribe();
        window.removeEventListener('nixgofood_demo_storage_change', handleDemoUpdate);
      };
    } else {
      const supabase = createClient();
      const channel = supabase
        .channel('cashier_orders_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            loadOrders();
            if (payload.new && (payload.new as any).id) {
              fetchSingleOrderHistory((payload.new as any).id);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Orders Realtime] subscription failed:', status, err);
          }
        });

      return () => {
        clearInterval(pollInterval);
        supabase.removeChannel(channel);
      };
    }
  }, [isDemo, triggerNewOrderAlert, selectedBranch?.id, branchLoading, businessId]);

  const handleCancelOrder = async (order: Order, reason: string) => {
    if (!reason.trim()) {
      alert('Por favor ingresa un motivo de cancelación obligatorio.');
      return;
    }

    try {
      await executeOrderAction({
        orderId: order.id,
        action: 'ADMIN_CANCEL',
        expectedFromStatus: order.status,
        reason: reason.trim(),
      });
      setCancelModalOrder(null);
      setCancelReason('');
      await loadOrders();
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      alert(err.message || 'Error al cancelar el pedido.');
    }
  };

  const handleOpenProofModal = async (ord: Order) => {
    setSelectedProofOrder(ord);
    setSelectedProofUrl(null);
    setLoadingProof(true);

    if (isDemo) {
      const blobUrl = await DemoStorage.getProofBlobUrl(ord.id);
      setSelectedProofUrl(blobUrl);
      setLoadingProof(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/proof-url?orderId=${encodeURIComponent(ord.id)}`);
      if (!res.ok) throw new Error('Error al obtener URL del comprobante');
      const data = await res.json();
      setSelectedProofUrl(data.signedUrl);
    } catch (e: any) {
      console.error('Error fetching proof URL:', e);
      alert(e.message || 'No se pudo cargar la imagen del comprobante.');
    } finally {
      setLoadingProof(false);
    }
  };

  const handleVerifyPayment = async (orderId: string, verified: boolean) => {
    try {
      await OrderRepository.updatePaymentVerificationStatus(
        orderId,
        verified ? 'verified' : 'rejected'
      );
      setSelectedProofOrder(null);
      await loadOrders();
    } catch (err: any) {
      console.error('Error verifying payment:', err);
      alert(err.message || 'Error al actualizar verificación de pago.');
    }
  };

  // Phase 2: Compute Attention Orders List (Sorted: Critical first, then Warning; within same severity, longest elapsed first)
  const attentionList = orders
    .map((ord) => {
      const sup = getOrderSupervisionState(ord, now, historyMap[ord.id]);
      return { order: ord, supervision: sup };
    })
    .filter((item) => item.supervision.severity !== 'normal');

  attentionList.sort((a, b) => {
    if (a.supervision.severity !== b.supervision.severity) {
      return a.supervision.severity === 'critical' ? -1 : 1;
    }
    return b.supervision.elapsedMinutes - a.supervision.elapsedMinutes;
  });

  // Phase 2.1 Navigation & Scroll Focus Architecture
  const handleAttentionCardClick = (orderId: string) => {
    const existingEl = document.getElementById(`order-card-${orderId}`);
    if (existingEl) {
      // Order card is already in DOM under current active filter
      existingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      existingEl.classList.add('ring-2', 'ring-amber-500');
      setTimeout(() => existingEl.classList.remove('ring-2', 'ring-amber-500'), 2200);
    } else {
      // Order card is not in DOM under current filter -> switch filter to 'attention' & schedule focus
      setSelectedStatusFilter('attention');
      setPendingFocusOrderId(orderId);
    }
  };

  // React Effect for robust pending focus navigation across filter changes
  useEffect(() => {
    if (!pendingFocusOrderId) return;

    const targetId = pendingFocusOrderId;
    const el = document.getElementById(`order-card-${targetId}`);

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-500');
      const timer = setTimeout(() => el.classList.remove('ring-2', 'ring-amber-500'), 2200);
      setPendingFocusOrderId(null);
      return () => clearTimeout(timer);
    } else {
      // Retry safely on next frame if element is mounting; if order disappeared, clear pending state safely
      const timer = setTimeout(() => {
        const retryEl = document.getElementById(`order-card-${targetId}`);
        if (retryEl) {
          retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          retryEl.classList.add('ring-2', 'ring-amber-500');
          setTimeout(() => retryEl.classList.remove('ring-2', 'ring-amber-500'), 2200);
        }
        setPendingFocusOrderId(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pendingFocusOrderId, selectedStatusFilter, orders]);

  // Filter Orders logic based on Single Source of Truth
  const filteredOrders = orders.filter((o) => {
    // 1. Status / Attention Tab Filtering
    if (selectedStatusFilter === 'attention') {
      const sup = getOrderSupervisionState(o, now, historyMap[o.id]);
      if (sup.severity === 'normal') return false;
    } else if (selectedStatusFilter !== 'all' && selectedStatusFilter !== 'todos') {
      const filterDef = ORDER_FILTERS.find((f) => f.id === selectedStatusFilter);
      if (filterDef && filterDef.statuses && !filterDef.statuses.includes(o.status)) {
        return false;
      }
    }

    // 2. Text Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = o.orderNumber.toLowerCase().includes(q);
      const matchCust = o.customer.name.toLowerCase().includes(q);
      const matchPhone = o.customer.phone.toLowerCase().includes(q);
      return matchNum || matchCust || matchPhone;
    }

    return true;
  });

  // Delivered orders are grouped by day (newest day first) for cashier end-of-day review
  const deliveredGroupedByDay =
    selectedStatusFilter === 'entregados'
      ? (() => {
          const groups = new Map<string, Order[]>();
          filteredOrders.forEach((ord) => {
            const key = getOrderDayKey(ord, historyMap);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(ord);
          });
          return Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
        })()
      : null;

  const renderOrderCard = (ord: Order) => {
    const supervision = getOrderSupervisionState(ord, now, historyMap[ord.id]);

    return (
      <div
        key={ord.id}
        id={`order-card-${ord.id}`}
        className={`bg-zinc-900 border rounded-3xl p-5 space-y-4 shadow-xl hover:border-zinc-700 transition-all ${
          supervision.severity === 'critical'
            ? 'border-rose-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900 to-rose-950/20'
            : supervision.severity === 'warning'
            ? 'border-amber-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900 to-amber-950/20'
            : 'border-zinc-800'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <span className="text-xl font-black text-white">{ord.orderNumber}</span>
            <span className="text-xs text-zinc-400 block font-medium">
              <Clock className="w-3 h-3 inline mr-1 text-zinc-500" />
              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <span
            className={`text-xs uppercase font-extrabold px-3 py-1 rounded-full border ${
              ord.status === 'new'
                ? 'bg-rose-950 text-rose-300 border-rose-700'
                : ord.status === 'preparing'
                ? 'bg-amber-950 text-amber-300 border-amber-700'
                : ord.status === 'ready'
                ? 'bg-blue-950 text-blue-300 border-blue-700'
                : ord.status === 'on_the_way'
                ? 'bg-purple-950 text-purple-300 border-purple-700'
                : ord.status === 'delivered'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                : 'bg-zinc-950 text-zinc-400 border-zinc-700'
            }`}
          >
            {getStatusLabel(ord.status)}
          </span>
        </div>

        {/* Supervision Status Bar (Accessible Color + Icon + Text) */}
        <div
          className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-2 transition-colors ${
            supervision.severity === 'critical'
              ? 'bg-rose-950/90 text-rose-200 border-rose-700/90'
              : supervision.severity === 'warning'
              ? 'bg-amber-950/80 text-amber-300 border-amber-700/80'
              : 'bg-zinc-950 text-zinc-400 border-zinc-800'
          }`}
        >
          <span className="truncate flex items-center gap-1.5">
            {supervision.severity === 'critical' && (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            {supervision.severity === 'warning' && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            {supervision.label}
          </span>
          <span className="text-[11px] font-bold opacity-80 shrink-0">
            {supervision.elapsedLabel}
          </span>
        </div>

        {/* Customer Details */}
        <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-850 space-y-1.5 text-xs">
          <div className="flex items-center justify-between font-bold text-zinc-200">
            <span>{ord.customer.name}</span>
            <span className="text-amber-400 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              {ord.customer.phone}
            </span>
          </div>
          {ord.deliveryLocation?.address && (
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              <span className="text-zinc-500 font-bold">Dirección: </span>
              {ord.deliveryLocation.address}
            </p>
          )}
          {ord.deliveryLocation?.reference && (
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              <span className="text-zinc-500 font-bold">Ref: </span>
              {ord.deliveryLocation.reference}
            </p>
          )}
          {ord.deliveryLocation && (
            <DeliveryLocationActions
              deliveryLocation={ord.deliveryLocation}
              customerName={ord.customer.name}
              motorizados={motorizados}
            />
          )}
        </div>

        {/* Items Summary */}
        <div className="bg-zinc-950/60 p-3 rounded-2xl border border-zinc-850">
          <OrderItemsList items={ord.items} notes={ord.notes} compact={false} />
        </div>

        {/* Payment & Totals */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-400 block font-medium">
              Pago:{' '}
              <span className="font-extrabold text-white">
                {(ord.paymentMethod || 'cash').toUpperCase()}
              </span>
            </span>
            {ord.paymentMethod === 'transfer' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenProofModal(ord);
                }}
                className="mt-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 underline"
              >
                <Camera className="w-3 h-3" />
                Ver Comprobante
              </button>
            )}
          </div>

          <div className="text-right">
            <span className="text-zinc-400 text-[10px] block font-bold">TOTAL</span>
            <span className="text-lg font-black text-amber-400">${ord.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Commercial & Administrative Actions Bar */}
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-850">
          {/* Administrative Correction Button (Strictly Owner/Admin) */}
          {['owner', 'admin'].includes(userRole) && ord.status !== 'new' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRollbackModalOrder(ord);
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-bold text-xs flex items-center gap-1.5 transition-all"
              title="Corrección administrativa de estado"
            >
              <Undo2 className="w-3.5 h-3.5 text-amber-400" />
              Corregir estado
            </button>
          )}

          {/* Cancel Order Action Button */}
          {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCancelModalOrder(ord);
              }}
              className="ml-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-extrabold text-xs flex items-center gap-1.5 transition-all"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              Cancelar Pedido
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <NewOrderAlertBanner />
        <LiveChatHandoffDrawer />

        <UndoToastNotification
          toast={activeUndoToast}
          onUndo={async (t) => {
            await OrderRepository.rollbackOrderStatus({
              orderId: t.orderId,
              expectedCurrentStatus: t.toStatus,
              targetStatus: t.fromStatus,
              reason: 'Deshacer inmediato en Caja',
            });
            setActiveUndoToast(null);
            await loadOrders();
          }}
          onDismiss={() => setActiveUndoToast(null)}
        />

        {/* Secondary Administrative Rollback Modal (Owner/Admin Only) */}
        {rollbackModalOrder && (
          <RollbackModal
            order={rollbackModalOrder}
            previousStatus={
              rollbackModalOrder.status === 'delivered'
                ? 'on_the_way'
                : rollbackModalOrder.status === 'on_the_way'
                ? 'ready'
                : rollbackModalOrder.status === 'ready'
                ? 'preparing'
                : 'new'
            }
            userRole={userRole}
            onClose={() => setRollbackModalOrder(null)}
            onConfirm={async (ord, prevStatus, reason) => {
              await OrderRepository.rollbackOrderStatus({
                orderId: ord.id,
                expectedCurrentStatus: ord.status,
                targetStatus: prevStatus,
                reason,
              });
              setRollbackModalOrder(null);
              await loadOrders();
            }}
          />
        )}

        {/* Order Cancellation Modal */}
        {cancelModalOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-400" />
                  Cancelar Pedido {cancelModalOrder.orderNumber}
                </h3>
                <button
                  onClick={() => {
                    setCancelModalOrder(null);
                    setCancelReason('');
                  }}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-zinc-300">
                  ¿Estás seguro de cancelar el pedido para <strong className="text-white">{cancelModalOrder.customer.name}</strong>?
                </p>
                <div>
                  <label className="block text-[11px] font-extrabold text-zinc-400 mb-1">
                    Motivo obligatorio de cancelación:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ej. Falta de insumos, cliente canceló por llamada..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setCancelModalOrder(null);
                    setCancelReason('');
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all"
                >
                  Volver
                </button>
                <button
                  onClick={() => handleCancelOrder(cancelModalOrder, cancelReason)}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-950/40 transition-all"
                >
                  Confirmar Cancelación
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header Control Panel */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              💳 CAJA Y GESTIÓN COMERCIAL DE PEDIDOS
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold uppercase">
                CAJA
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Consulta transaccional, verificación de pagos, historial y atención al cliente.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar #pedido, cliente o telf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        {/* Phase 2 & 2.1: Bloque Compacto "Requieren Atención" (Hidden when count = 0) */}
        {attentionList.length > 0 && (
          <div className="bg-zinc-900 border border-amber-800/80 rounded-3xl p-4 shadow-xl space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                REQUIEREN ATENCIÓN ({attentionList.length})
              </h2>
              <button
                onClick={() => setSelectedStatusFilter('attention')}
                className="text-[11px] font-extrabold text-amber-400 hover:text-amber-300 underline"
              >
                Filtrar solo atención
              </button>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
              {attentionList.map(({ order: ord, supervision: sup }) => (
                <button
                  key={`att-${ord.id}`}
                  onClick={() => handleAttentionCardClick(ord.id)}
                  className={`shrink-0 text-left px-3.5 py-2.5 rounded-2xl border transition-all flex items-center gap-3 ${
                    sup.severity === 'critical'
                      ? 'bg-rose-950/80 border-rose-700/90 text-rose-200 hover:bg-rose-900/90 shadow-md shadow-rose-950/30'
                      : 'bg-amber-950/80 border-amber-700/80 text-amber-200 hover:bg-amber-900/90 shadow-md shadow-amber-950/30'
                  }`}
                >
                  <span className="text-sm font-black">
                    {sup.severity === 'critical' ? '🔴' : '🟠'} {ord.orderNumber}
                  </span>
                  <div className="text-[11px] leading-tight">
                    <span className="font-extrabold block">{sup.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter Badges with Single Source of Truth + Phase 2 Quick Filter Chip */}
        {/* Se acomodan en varias lineas en vez de un carrusel horizontal: con
            scrollbar-none no habia ninguna pista de que quedaban filtros fuera
            de pantalla, asi que en movil parecian no existir. */}
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {ORDER_FILTERS.map((tab) => {
            const count = getOrderFilterCount(orders, tab.id);
            const isActive = selectedStatusFilter === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusFilter(tab.id)}
                aria-label={tab.ariaLabel(count)}
                className={`h-11 px-4 rounded-xl font-extrabold text-xs whitespace-nowrap transition-all flex items-center gap-2 border ${
                  isActive
                    ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-950/40'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                <span>{tab.label}</span>
                <OrderFilterBadge count={count} config={tab} />
              </button>
            );
          })}

          {/* Phase 2: Attention Quick Filter Badge */}
          <button
            onClick={() => setSelectedStatusFilter('attention')}
            aria-label={`Filtrar pedidos que requieren atención: ${attentionList.length}`}
            className={`h-11 px-4 rounded-xl font-extrabold text-xs whitespace-nowrap transition-all flex items-center gap-2 border ${
              selectedStatusFilter === 'attention'
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/40'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <span>⚠️ Atención</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 text-[10px] font-black border border-rose-800">
              {attentionList.length}
            </span>
          </button>
        </div>

        {/* Orders List / Grid */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-extrabold">Cargando pedidos de caja...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-3">
            <ShoppingBag className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-sm font-bold text-zinc-300">No hay pedidos que coincidan con la búsqueda</p>
          </div>
        ) : deliveredGroupedByDay ? (
          <div className="space-y-8">
            {deliveredGroupedByDay.map(([dayKey, dayOrders]) => (
              <div key={dayKey} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-black text-zinc-200 uppercase tracking-wide whitespace-nowrap">
                    {formatDayLabel(dayKey)}
                  </h3>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 text-[11px] font-extrabold border border-zinc-700 whitespace-nowrap">
                    {dayOrders.length} {dayOrders.length === 1 ? 'pedido' : 'pedidos'} · $
                    {dayOrders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dayOrders.map(renderOrderCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map(renderOrderCard)}
          </div>
        )}

        {/* Proof Viewer Modal */}
        {selectedProofOrder && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="font-extrabold text-lg text-white">
                    Comprobante de Pago {selectedProofOrder.orderNumber}
                  </h3>
                  <p className="text-xs text-zinc-400">{selectedProofOrder.customer.name}</p>
                </div>
                <button
                  onClick={() => setSelectedProofOrder(null)}
                  className="p-2 rounded-xl bg-zinc-950 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Image Container */}
              <div className="relative w-full h-72 bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden">
                {loadingProof ? (
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                ) : selectedProofUrl ? (
                  <img
                    src={selectedProofUrl}
                    alt="Comprobante"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="text-xs text-zinc-500">No se pudo cargar la imagen del comprobante</p>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleVerifyPayment(selectedProofOrder.id, false)}
                  className="w-full py-3 px-4 rounded-xl bg-rose-950/80 border border-rose-700 hover:bg-rose-900 font-extrabold text-rose-200 text-xs flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Rechazar Comprobante
                </button>

                <button
                  onClick={() => handleVerifyPayment(selectedProofOrder.id, true)}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-black text-zinc-950 text-xs shadow-lg flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Verificar Pago OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function OrdersClientPage() {
  return (
    <OperationalClockProvider>
      <OrdersPageContent />
    </OperationalClockProvider>
  );
}
