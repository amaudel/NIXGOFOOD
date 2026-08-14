'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  Store,
  Truck,
  User,
  Phone,
  AlertCircle,
  ShoppingBag,
  MapPin,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { LocationPicker } from '@/components/LocationPicker';
import { activeBranch, CURRENT_BUSINESS_ID } from '@/config/business';
import { OrderRepository } from '@/repositories/OrderRepository';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    cart,
    clearCart,
    cartSubtotal,
    deliveryMethod,
    setDeliveryMethod,
    deliveryLocation,
    deliveryFeeResult,
    customerInfo,
    setCustomerInfo,
  } = useApp();

  const [name, setName] = useState(customerInfo.name);
  const [phone, setPhone] = useState(customerInfo.phone);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If cart is empty, show empty state prompt
  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white">No tienes productos en el carrito</h2>
        <p className="text-zinc-400 text-sm">
          Agrega deliciosos tacos o hamburguesas desde el menú antes de continuar.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al menú</span>
        </Link>
      </div>
    );
  }

  const currentDeliveryFee = deliveryMethod === 'delivery' ? deliveryFeeResult.fee : 0;
  const orderTotal = cartSubtotal + currentDeliveryFee;

  const handleConfirmOrder = async () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError('Por favor ingresa tu nombre.');
      return;
    }

    if (!phone.trim() || phone.trim().length < 7) {
      setFormError('Por favor ingresa un número de teléfono válido.');
      return;
    }

    if (deliveryMethod === 'delivery' && !deliveryFeeResult.available) {
      setFormError('Tu ubicación seleccionada está fuera de nuestra zona de delivery.');
      return;
    }

    setIsSubmitting(true);
    setCustomerInfo({ name: name.trim(), phone: phone.trim() });

    try {
      // Transactional RPC Payload (Server recalculates exact prices & delivery fee)
      const payload = {
        businessId: CURRENT_BUSINESS_ID,
        branchId: activeBranch.id,
        customer: { name: name.trim(), phone: phone.trim() },
        deliveryMethod,
        deliveryLocation: deliveryMethod === 'delivery' ? deliveryLocation : null,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers.map((m) => ({
            modifierId: m.modifierId,
            modifierName: m.modifierName,
          })),
          notes: item.notes || '',
        })),
      };

      const result = await OrderRepository.createOrderTransactional(payload);

      if (result && result.trackingToken) {
        clearCart();
        router.push(`/order/${result.trackingToken}`);
      } else {
        throw new Error('No se pudo obtener el identificador de seguimiento del pedido.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error al procesar el pedido. Intenta nuevamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Navigation Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al menú</span>
        </Link>
        <h1 className="font-extrabold text-xl text-white">Finalizar Pedido</h1>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Delivery Option & Location & Customer Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* Option Selector */}
          <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 space-y-3">
            <h2 className="font-bold text-base text-white">¿Cómo quieres recibir tu pedido?</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod('delivery')}
                className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border font-bold text-sm transition-all ${
                  deliveryMethod === 'delivery'
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Truck className="w-5 h-5" />
                <span>Delivery</span>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryMethod('pickup')}
                className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border font-bold text-sm transition-all ${
                  deliveryMethod === 'pickup'
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Store className="w-5 h-5" />
                <span>Retiro en local</span>
              </button>
            </div>
          </div>

          {/* Location Picker (If Delivery) */}
          {deliveryMethod === 'delivery' ? (
            <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 space-y-4">
              <h2 className="font-bold text-base text-white">¿Dónde entregamos?</h2>
              <LocationPicker />
            </div>
          ) : (
            /* Pickup Branch Card (If Pickup) */
            <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-base">
                <Store className="w-5 h-5" />
                <h2>Retiro en Local</h2>
              </div>
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 text-xs">
                <p className="font-extrabold text-sm text-white">{activeBranch.name}</p>
                <p className="text-zinc-300 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{activeBranch.address}</span>
                </p>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-zinc-400 font-semibold">
                  <span>Costo de envío:</span>
                  <span className="text-emerald-400 font-bold text-sm">$0.00 (Retiro en local)</span>
                </div>
              </div>
            </div>
          )}

          {/* Customer Contact Details Form */}
          <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 space-y-4">
            <h2 className="font-bold text-base text-white">Tus Datos de Contacto</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="input-customer-name" className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Nombre completo *
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-customer-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-customer-phone" className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Teléfono / WhatsApp *
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-customer-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: 0991234567"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary & Confirmation CTA */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 space-y-5 sticky top-24">
            <h2 className="font-bold text-lg text-white border-b border-zinc-800 pb-3">Resumen de Tu Pedido</h2>

            {/* Product items list */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1 no-scrollbar">
              {cart.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex-1">
                    <p className="font-bold text-zinc-200">
                      {item.quantity}× {item.product.name}
                    </p>
                    {item.selectedModifiers.length > 0 && (
                      <p className="text-[11px] text-zinc-400">
                        {item.selectedModifiers.map((m) => m.modifierName).join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-[11px] text-amber-400 italic">&quot;{item.notes}&quot;</p>
                    )}
                  </div>
                  <span className="font-bold text-zinc-300">${item.totalPrice.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Price Calculations */}
            <div className="space-y-2 pt-3 border-t border-zinc-800 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-semibold text-zinc-200">${cartSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-zinc-400">
                <span>Costo Delivery</span>
                <span className="font-semibold text-zinc-200">
                  {deliveryMethod === 'delivery'
                    ? deliveryFeeResult.available
                      ? `$${deliveryFeeResult.fee.toFixed(2)}`
                      : 'No disponible'
                    : '$0.00 (Retiro)'}
                </span>
              </div>

              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                <span>Total a Pagar</span>
                <span className="text-amber-400 text-xl">${orderTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Form Error Notification */}
            {formError && (
              <div className="bg-rose-950/60 border border-rose-800 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleConfirmOrder}
              disabled={isSubmitting || (deliveryMethod === 'delivery' && !deliveryFeeResult.available)}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl shadow-rose-950/80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-base"
            >
              <CheckCircle className="w-5 h-5" />
              <span>
                {isSubmitting
                  ? 'Validando y procesando...'
                  : deliveryMethod === 'delivery' && !deliveryFeeResult.available
                  ? 'Ubicación fuera de cobertura'
                  : 'Confirmar pedido'}
              </span>
            </button>

            <p className="text-[11px] text-zinc-400 text-center">
              Al confirmar, tu pedido será validado en el servidor e insertado de forma transaccional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
