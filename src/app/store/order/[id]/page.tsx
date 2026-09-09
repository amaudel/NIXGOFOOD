'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Home,
  RefreshCw,
  ChefHat,
  Bike,
  PackageCheck,
  Receipt,
  Store,
  AlertCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import { OrderStatus } from '@/types';
import { businessConfig } from '@/config/business';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { getOrderRepository } from '@/repositories/factory';
import { OrderLookupModal } from '@/components/OrderLookupModal';
import { useApp } from '@/context/AppContext';

const getStatusSteps = (
  businessName: string
): { status: OrderStatus; label: string; icon: React.ElementType; description: string }[] => [
  { status: 'new', label: 'Pedido recibido', icon: Receipt, description: `Tu pedido ha sido recibido por ${businessName}.` },
  { status: 'preparing', label: 'En preparación', icon: ChefHat, description: 'Nuestros taqueros están preparando tus alimentos.' },
  { status: 'ready', label: 'Listo', icon: Store, description: 'Tu pedido está empacado y listo.' },
  { status: 'on_the_way', label: 'En camino', icon: Bike, description: 'El repartidor lleva tu pedido hacia la ubicación.' },
  { status: 'delivered', label: 'Entregado', icon: PackageCheck, description: '¡Buen provecho! Pedido entregado.' },
];

export default function OrderSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const trackingToken = resolvedParams.id;
  const { business, isDemo } = useApp();
  const businessName = business?.name || businessConfig.name;
  const statusSteps = getStatusSteps(businessName);

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

  const fetchOrder = async () => {
    setIsRefreshing(true);
    try {
      if (isDemo) {
        const repo = getOrderRepository();
        const demoOrder = await repo.getOrderByTrackingToken(trackingToken);
        if (demoOrder) {
          setOrder({
            id: demoOrder.id,
            orderNumber: demoOrder.orderNumber,
            trackingToken: demoOrder.trackingToken,
            status: demoOrder.status,
            deliveryMethod: demoOrder.deliveryMethod,
            paymentMethod: demoOrder.paymentMethod,
            transferDetails: demoOrder.transferDetails,
            subtotal: demoOrder.subtotal,
            deliveryFee: demoOrder.deliveryFee,
            total: demoOrder.total,
            customerName: demoOrder.customer.name,
            customerPhone: demoOrder.customer.phone,
            deliveryAddress: demoOrder.deliveryLocation?.address,
            deliveryReference: demoOrder.deliveryLocation?.reference,
            estimatedMinutes: demoOrder.estimatedTime,
            createdAt: demoOrder.createdAt,
            items: demoOrder.items.map((it: any) => ({
              id: it.id,
              productName: it.productName,
              unitPrice: it.unitPrice,
              quantity: it.quantity,
              totalPrice: it.totalPrice,
              notes: it.notes,
              selectedModifiers: (it.selectedModifiers || []).map((m: any) => ({
                modifierName: m.modifierName,
                price: m.price,
              })),
            })),
          });
          setError(null);
          return;
        }
      }

      const res = await fetch(`/api/orders/${trackingToken}`);
      if (!res.ok) {
        throw new Error('No se pudo obtener la información del pedido.');
      }
      const data = await res.json();
      setOrder(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Initial fetch, 4-second polling, and BroadcastChannel instant tab-to-tab sync
  useEffect(() => {
    fetchOrder();

    // Secure 4-second polling
    const interval = setInterval(() => {
      fetchOrder();
    }, 4000);

    // BroadcastChannel instant sync between open tabs in Demo Mode
    const unsubscribe = DemoBroadcastService.subscribe((msg) => {
      if (msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'DEMO_RESET') {
        fetchOrder();
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [trackingToken]);

  const getCurrentStepIndex = (status: OrderStatus): number => {
    switch (status) {
      case 'new':
        return 0;
      case 'preparing':
        return 1;
      case 'ready':
        return 2;
      case 'on_the_way':
        return 3;
      case 'delivered':
        return 4;
      default:
        return 0;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 space-y-4">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-zinc-400">Buscando información de tu pedido...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-amber-950/80 border border-amber-800 rounded-full flex items-center justify-center mx-auto text-amber-500">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black">Pedido no encontrado</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No pudimos encontrar este pedido. Puedes buscarlo nuevamente con tu número de orden y teléfono.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setIsLookupModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-rose-600 text-zinc-950 font-black px-5 py-3 rounded-xl text-xs shadow-lg hover:from-amber-400 hover:to-rose-500 transition-all"
            >
              <Search className="w-4 h-4" />
              <span>Buscar mi pedido</span>
            </button>

            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white font-bold px-5 py-3 rounded-xl text-xs transition-all"
            >
              <Home className="w-4 h-4" />
              <span>Volver al Menú</span>
            </Link>
          </div>
        </div>

        <OrderLookupModal
          isOpen={isLookupModalOpen}
          onClose={() => setIsLookupModalOpen(false)}
        />
      </div>
    );
  }

  const currentStep = getCurrentStepIndex(order.status);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Navigation */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
            <Home className="w-4 h-4 text-amber-500" />
            <span>Volver al Menú</span>
          </Link>

          <button
            onClick={fetchOrder}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Order Banner Card */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
                {businessName} · Seguimiento
              </span>
              <h1 className="text-3xl font-black text-white pt-1">Pedido {order.orderNumber}</h1>
              <p className="text-xs text-zinc-400 pt-0.5">
                {new Date(order.createdAt).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Tiempo Estimado</span>
              <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-lg">
                <Clock className="w-5 h-5" />
                <span>{order.estimatedMinutes || '25-35 min'}</span>
              </div>
            </div>
          </div>

          {/* Visual Step Timeline */}
          <div className="space-y-6 pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Estado del Pedido</h2>

            <div className="relative space-y-6 before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-800">
              {statusSteps.map((step, idx) => {
                const StepIcon = step.icon;
                const isPassed = idx < currentStep;
                const isCurrent = idx === currentStep;

                return (
                  <div key={step.status} className="relative flex items-start gap-4">
                    <div
                      className={`relative z-10 w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${
                        isCurrent
                          ? 'bg-amber-500 border-amber-400 text-zinc-950 shadow-lg shadow-amber-950/80 animate-bounce'
                          : isPassed
                          ? 'bg-rose-600 border-rose-500 text-white shadow-md'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-600'
                      }`}
                    >
                      {isPassed ? <CheckCircle2 className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                    </div>

                    <div className="pt-1 space-y-0.5">
                      <h3
                        className={`text-sm font-extrabold ${
                          isCurrent
                            ? 'text-amber-400'
                            : isPassed
                            ? 'text-zinc-200'
                            : 'text-zinc-500'
                        }`}
                      >
                        {step.label}
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Details */}
          <div className="bg-zinc-950 p-4 sm:p-5 rounded-2xl border border-zinc-850 space-y-3 text-xs">
            <div className="flex items-center justify-between font-extrabold text-zinc-200 border-b border-zinc-850 pb-2">
              <span>{order.customerName}</span>
              <span className="text-amber-400 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {order.customerPhone}
              </span>
            </div>

            <div className="space-y-1 text-zinc-400">
              <span className="font-bold text-rose-400 block">
                {order.deliveryMethod === 'delivery' ? '🛵 Entrega a Domicilio' : '🏪 Retiro en Local'}
              </span>
              {order.deliveryAddress && (
                <p className="flex items-start gap-1.5 text-zinc-300">
                  <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    {order.deliveryAddress}{' '}
                    {order.deliveryReference && (
                      <span className="text-zinc-500">({order.deliveryReference})</span>
                    )}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Payment Verification Banner (Transferencia) */}
          {order.paymentMethod === 'transfer' && (
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-850 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <span className="font-extrabold text-zinc-300">Pago por Transferencia</span>
                {order.transferDetails?.verificationStatus === 'verified' ? (
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    Pago Verificado
                  </span>
                ) : order.transferDetails?.verificationStatus === 'rejected' ? (
                  <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    Comprobante Rechazado
                  </span>
                ) : (
                  <span className="bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    Pendiente de Verificación
                  </span>
                )}
              </div>

              <div className="pt-1">
                {order.transferDetails?.verificationStatus === 'verified' ? (
                  <p className="text-emerald-400 font-medium">✓ Pago verificado.</p>
                ) : order.transferDetails?.verificationStatus === 'rejected' ? (
                  <p className="text-rose-400 font-medium">
                    ✕ El restaurante no pudo validar el comprobante. Comunícate con el local o envía uno nuevo.
                  </p>
                ) : (
                  <p className="text-amber-300 font-medium">
                    ⏳ Comprobante recibido. Pendiente de verificación por el restaurante.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Itemized Receipt */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Resumen de la Comanda</h3>

            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar pr-1">
              {order.items.map((it: any) => (
                <div key={it.id} className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/80 flex justify-between items-start text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-zinc-200">
                      {it.quantity} × {it.productName}
                    </span>
                    {it.selectedModifiers && it.selectedModifiers.length > 0 && (
                      <p className="text-[10px] text-zinc-400">
                        {it.selectedModifiers.map((m: any) => m.modifierName).join(', ')}
                      </p>
                    )}
                    {it.notes && <p className="text-[10px] text-amber-400 italic">&quot;{it.notes}&quot;</p>}
                  </div>
                  <span className="font-black text-amber-400 text-sm">${it.totalPrice.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-800 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Envío Delivery</span>
                <span>${order.deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800/60">
                <span>Total Pagado</span>
                <span className="text-amber-400">${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
