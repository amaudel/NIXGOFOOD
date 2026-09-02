'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2, Plus, Minus, Store, Truck, ArrowRight, ShoppingBag } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export const CartDrawer: React.FC = () => {
  const router = useRouter();
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateCartItemQuantity,
    removeFromCart,
    cartSubtotal,
    deliveryMethod,
    setDeliveryMethod,
    deliveryFeeResult,
  } = useApp();

  if (!isCartOpen) return null;

  const handleCheckoutClick = () => {
    setIsCartOpen(false);
    router.push('/checkout');
  };

  const currentDeliveryFee = deliveryMethod === 'delivery' ? deliveryFeeResult.fee : 0;
  const estimatedTotal = cartSubtotal + currentDeliveryFee;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-fadeIn">
      {/* h-[100dvh] en vez de h-full: en movil real, la barra de
          direcciones del navegador se expande/colapsa DESPUES de que la
          pagina ya calculo su layout -- dvh (dynamic viewport height) es la
          unidad pensada para eso, a diferencia de vh/% que puede quedar
          calculado contra una altura mas grande de la que en realidad se ve. */}
      <div className="relative w-full max-w-md bg-zinc-900 text-zinc-100 h-[100dvh] flex flex-col border-l border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-rose-500" />
            <h2 className="font-bold text-lg text-white">Tu pedido</h2>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            aria-label="Cerrar carrito"
            className="w-11 h-11 flex items-center justify-center rounded-full text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        {/* min-h-0: sin esto, un hijo flex con overflow-y-auto puede crecer
            para ajustarse a su contenido en vez de scrollear dentro del
            espacio que le toca -- con varios productos, eso empuja el
            resumen y el boton de abajo fuera de la pantalla visible. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5 no-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-20 h-20 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600">
                <ShoppingBag className="w-10 h-10 text-zinc-700" />
              </div>
              <h3 className="text-lg font-bold text-zinc-200">Tu carrito está vacío</h3>
              <p className="text-zinc-400 text-sm max-w-xs">
                Descubre algo delicioso en nuestro menú y agrégalo aquí.
              </p>
              <button
                onClick={() => setIsCartOpen(false)}
                className="mt-2 px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm border border-zinc-700 transition-all"
              >
                Explorar menú
              </button>
            </div>
          ) : (
            <>
              {/* Delivery Method Selector */}
              <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  ¿Cómo quieres recibir tu pedido?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                      deliveryMethod === 'delivery'
                        ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-md'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Delivery</span>
                  </button>
                  <button
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                      deliveryMethod === 'pickup'
                        ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-md'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span>Retiro en local</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-800 flex items-start gap-3 relative group"
                  >
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-16 h-16 rounded-xl object-cover border border-zinc-800"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-zinc-100 truncate">{item.product.name}</h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Quitar ${item.product.name} del pedido`}
                          className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Eliminar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Selected Modifiers list */}
                      {item.selectedModifiers.length > 0 && (
                        <div className="text-[11px] text-zinc-400 leading-tight space-y-0.5">
                          {item.selectedModifiers.map((mod, idx) => (
                            <p key={idx}>
                              • {mod.modifierName}
                              {mod.price > 0 && ` (+$${mod.price.toFixed(2)})`}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {item.notes && (
                        <p className="text-[11px] text-amber-400/90 italic bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/50">
                          &quot;{item.notes}&quot;
                        </p>
                      )}

                      {/* Quantity & Unit price */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg">
                          <button
                            onClick={() => updateCartItemQuantity(item.id, -1)}
                            aria-label="Quitar una unidad"
                            className="w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-white"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-white">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(item.id, 1)}
                            aria-label="Agregar una unidad"
                            className="w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-white"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="font-extrabold text-sm text-amber-400">
                          ${item.totalPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer Summary */}
        {cart.length > 0 && (
          <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 space-y-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-semibold text-zinc-200">${cartSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Delivery</span>
                <span className="font-semibold text-zinc-200">
                  {deliveryMethod === 'delivery' ? `$${deliveryFeeResult.fee.toFixed(2)}` : '$0.00 (Retiro)'}
                </span>
              </div>

              <div className="flex items-center justify-between text-base font-extrabold text-white pt-2 border-t border-zinc-800">
                <span>Total Estimado</span>
                <span className="text-amber-400 text-lg">${estimatedTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleCheckoutClick}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold py-3.5 px-6 rounded-2xl shadow-xl shadow-rose-950/60 active:scale-95 transition-all text-base"
            >
              <span>Continuar a la Ubicación</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
