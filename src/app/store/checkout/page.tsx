'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Store,
  Truck,
  User,
  Phone,
  AlertCircle,
  ShoppingBag,
  CreditCard,
  Banknote,
  Building2,
  Copy,
  Check,
  ChevronRight,
  Trash2,
  MessageSquare,
  Sparkles,
  Plus,
  Minus,
  ShieldCheck,
  ExternalLink,
  Clock,
  Camera,
  Upload,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useBranch } from '@/context/BranchContext';
import { useDemoraCocina } from '@/hooks/useDemoraCocina';
import { aplicarExtraARango } from '@/lib/aplicarExtraARango';
import { LocationPicker } from '@/components/LocationPicker';
import { BranchPicker } from '@/components/BranchPicker';
import { businessConfig } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { StorageService } from '@/services/StorageService';
import { DemoStorage } from '@/repositories/demo/DemoStorage';
import { saveRecentOrder } from '@/utils/recentOrders';
import { OrderRepository } from '@/repositories/OrderRepository';
import { PaymentMethod, Order } from '@/types';

// Tiempo fijo de preparacion para retiro en local; se usa tanto en el
// formulario como en la pantalla de exito.
// Respaldo, no la fuente: el tiempo real de retiro lo configura cada
// sucursal y llega por /api/prep-time. Esto solo se usa mientras la
// consulta no respondio, o si fallo.
const RETIRO_POR_DEFECTO = '15-25 min';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    businessId,
    business,
    cart,
    clearCart,
    cartSubtotal,
    deliveryMethod,
    setDeliveryMethod,
    deliveryLocation,
    deliveryFeeResult,
    storeStatus,
    catalogLoading,
    customerInfo,
    setCustomerInfo,
    updateCartItemQuantity,
    removeFromCart,
    updateItemNotes,
  } = useApp();
  const { selectedBranch, branches } = useBranch();
  const demoraCocina = useDemoraCocina((selectedBranch || branches[0])?.id);

  // Form State
  const [name, setName] = useState(customerInfo.name || '');
  const [phone, setPhone] = useState(customerInfo.phone || '');

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [needsChange, setNeedsChange] = useState<boolean>(false);
  const [payWithAmount, setPayWithAmount] = useState<string>('');
  const [copiedBank, setCopiedBank] = useState<boolean>(false);

  // Proof Photo State (Transferencia)
  const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
  const [transferProofPreviewUrl, setTransferProofPreviewUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  // UI State
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [mostrarSucursales, setMostrarSucursales] = useState(false);

  // Tiene que quedar junto al resto de los hooks, ARRIBA del early return del
  // carrito vacio. El carrito se restaura desde localStorage en un efecto, o
  // sea despues del primer render: al entrar directo a /checkout el primer
  // render cortaba en ese return (sin llegar a este useRef) y el segundo, ya
  // con productos, si lo ejecutaba -- React tiraba el arbol con "Rendered more
  // hooks than during the previous render", y como el commit no completaba, la
  // escritura que devolvia el carrito a localStorage nunca corria.
  const isSubmittingRef = useRef<boolean>(false);
  const entregaRef = useRef<HTMLDivElement>(null);

  // TODO(seguimiento): business.paymentConfig no existe todavia en la tabla
  // `businesses` (solo en el tipo TS) -- hasta que se agregue esa columna,
  // CUALQUIER negocio usando pago por transferencia muestra estos mismos
  // datos bancarios de fallback. No hay forma de arreglarlo sin migracion de
  // base de datos; queda fuera del alcance de esta fase.
  const bankInfo = business?.paymentConfig?.bankInfo || businessConfig.paymentConfig?.bankInfo || {
    bankName: 'Banco Pichincha',
    accountType: 'Cuenta de Ahorros',
    accountNumber: '2204567890',
    accountHolder: 'El Taca Nijo S.A.S.',
    identification: '0190456789001',
  };

  // Handle Photo Attachment Selection
  const handleSelectProofFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProofError(null);
    setFormError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setProofError('Formato no válido. Adjunta una imagen JPG, PNG o WebP.');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      setProofError(
        `La imagen supera el tamaño máximo de 5 MB (tamaño actual: ${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      return;
    }

    setTransferProofFile(file);
    const objectUrl = URL.createObjectURL(file);
    setTransferProofPreviewUrl(objectUrl);
  };

  // Handle Remove Photo Attachment
  const handleRemoveProofFile = () => {
    setTransferProofFile(null);
    if (transferProofPreviewUrl) {
      URL.revokeObjectURL(transferProofPreviewUrl);
    }
    setTransferProofPreviewUrl(null);
    setProofError(null);
  };

  // If cart is empty and not on success screen
  if (cart.length === 0 && !createdOrder) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shadow-xl">
          <ShoppingBag className="w-10 h-10 text-rose-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">Tu carrito está vacío</h2>
          <p className="text-zinc-400 text-xs sm:text-sm max-w-md mx-auto">
            Descubre el menú de <strong>{business?.name || businessConfig.name}</strong> y agrega algo delicioso para iniciar tu pedido.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-lg transition-all text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al menú</span>
        </Link>
      </div>
    );
  }

  const currentDeliveryFee = deliveryMethod === 'delivery' ? deliveryFeeResult.fee : 0;
  const orderTotal = cartSubtotal + currentDeliveryFee;

  // Copy bank account helper
  const handleCopyAccount = () => {
    navigator.clipboard.writeText(bankInfo.accountNumber);
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  // Checkout de una sola pantalla: no hay pasos que avanzar, asi que toda
  // la validacion que antes vivia repartida en tres handlers de transicion
  // corre de una sola vez al confirmar. Devuelve el primer error que
  // encuentra, o null si el pedido esta listo para enviarse.
  const validateOrder = (): string | null => {
    if (!name.trim()) {
      return 'Por favor ingresa tu nombre completo.';
    }

    if (!phone.trim() || phone.trim().length < 7) {
      return 'Por favor ingresa un número de teléfono / WhatsApp válido.';
    }

    if (deliveryMethod === 'delivery') {
      if (!deliveryLocation?.hasSelectedLocation) {
        return 'Selecciona tu ubicación exacta en el mapa para calcular el envío.';
      }
      if (!deliveryFeeResult.available) {
        return 'La ubicación seleccionada está fuera de nuestra zona de delivery.';
      }
      // El pin solo dice donde caer; sin calle escrita el repartidor llega
      // con coordenadas y nada mas.
      if (!deliveryLocation.address?.trim()) {
        return 'Escribe la dirección de entrega para que el repartidor pueda llegar.';
      }
    }

    if (paymentMethod === 'cash' && needsChange) {
      const parsedAmount = parseFloat(payWithAmount);
      if (isNaN(parsedAmount) || parsedAmount < orderTotal) {
        return `El monto de pago ($${payWithAmount || 0}) debe ser igual o mayor al total del pedido ($${orderTotal.toFixed(2)}).`;
      }
    }

    if (paymentMethod === 'transfer' && !transferProofPreviewUrl && !transferProofFile) {
      return 'Adjunta una foto del comprobante de transferencia para continuar.';
    }

    return null;
  };

  // El banner de error vive arriba de todo, pero "Confirmar pedido" se toca
  // desde el fondo de la pantalla (la barra fija en movil, o el panel
  // lateral). Sin este scroll, el cliente tocaba confirmar, nada parecia
  // pasar, y el mensaje de por que quedaba fuera de vista.
  const mostrarError = (mensaje: string) => {
    setFormError(mensaje);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Final Order Submission
  const handleConfirmOrder = async () => {
    if (isSubmittingRef.current || isSubmitting) return;

    // storeStatus arranca en "abierto" mientras el horario real todavia no
    // termina de cargar (sin horas cargadas no hay forma de saber lo
    // contrario) -- un cliente recurrente con nombre, telefono y direccion
    // ya guardados de una sesion anterior podia tocar "Confirmar pedido"
    // dentro de esa ventana y el pedido se creaba igual, aunque el local
    // estuviera cerrado de verdad.
    if (catalogLoading) {
      mostrarError('Estamos cargando los datos del negocio. Intenta de nuevo en un momento.');
      return;
    }

    if (!storeStatus.isOpen) {
      mostrarError(
        storeStatus.reason || 'El local está cerrado en este momento y no puede recibir tu pedido.'
      );
      return;
    }

    const validationError = validateOrder();
    if (validationError) {
      mostrarError(validationError);
      return;
    }

    setCustomerInfo({ name: name.trim(), phone: phone.trim() });

    isSubmittingRef.current = true;
    setFormError(null);
    setIsSubmitting(true);

    let uploadedProofPath: string | undefined = undefined;
    let uploadedCleanupToken: string | undefined = undefined;

    try {
      // Real Storage Upload if Transfer & Real Mode
      if (paymentMethod === 'transfer' && !isDemoMode()) {
        if (!transferProofFile) {
          throw new Error('Adjunta una foto del comprobante de transferencia para continuar.');
        }

        const uploadRes = await StorageService.uploadPaymentProof(transferProofFile);
        uploadedProofPath = uploadRes.proofPath;
        uploadedCleanupToken = uploadRes.cleanupToken;
      }

      const payload = {
        businessId,
        branchId: (selectedBranch || branches[0]).id,
        // Lo suma el RPC al tiempo que guarda, para que el seguimiento
        // muestre lo mismo que se prometio aca. El calculo de escalones
        // vive del lado del cliente (una sola implementacion, testeada);
        // la base solo suma y acota.
        extraMinutes: demoraCocina.minutosExtra,
        customer: { name: name.trim(), phone: phone.trim() },
        deliveryMethod,
        deliveryLocation:
          deliveryMethod === 'delivery'
            ? { ...deliveryLocation, reference: (deliveryLocation.reference || '').trim() }
            : null,
        paymentMethod,
        cashChange:
          paymentMethod === 'cash'
            ? {
                needsChange,
                payWith: needsChange ? parseFloat(payWithAmount) : undefined,
              }
            : undefined,
        transferDetails:
          paymentMethod === 'transfer'
            ? {
                bankName: bankInfo.bankName,
                accountNumber: bankInfo.accountNumber,
                accountHolder: bankInfo.accountHolder,
                proofPath: uploadedProofPath || undefined,
                proofFileName: transferProofFile?.name || 'comprobante_transferencia.jpg',
                proofMimeType: transferProofFile?.type || 'image/jpeg',
                proofFileSize: transferProofFile?.size || 0,
                proofUploadedAt: new Date().toISOString(),
                verificationStatus: 'pending',
              }
            : undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers.map((m) => ({
            groupId: m.groupId,
            groupName: m.groupName,
            modifierId: m.modifierId,
            modifierName: m.modifierName,
            price: m.price,
          })),
          notes: item.notes || '',
        })),
        subtotal: cartSubtotal,
        deliveryFee: currentDeliveryFee,
        total: orderTotal,
      };

      const result = await OrderRepository.createOrderTransactional(payload);

      if (result && (result.trackingToken || result.id)) {
        // In Demo Mode, save proof Blob to IndexedDB for local multi-tab admin preview
        if (isDemoMode() && paymentMethod === 'transfer' && transferProofFile && result.id) {
          await DemoStorage.saveProofBlob(result.id, transferProofFile);
        }

        // Save to local recent orders manager
        saveRecentOrder(
          result.orderNumber ? String(result.orderNumber) : '#1050',
          result.trackingToken || result.id
        );

        clearCart();
        // The create_order RPC response omits deliveryMethod/paymentMethod/deliveryLocation,
        // so fill them from the values we just submitted rather than trusting the RPC shape.
        setCreatedOrder({
          ...result,
          deliveryMethod,
          paymentMethod,
          deliveryLocation:
            deliveryMethod === 'delivery'
              ? { ...deliveryLocation, reference: (deliveryLocation.reference || '').trim() }
              : undefined,
          // Es el momento de mas ansiedad del cliente y lo unico que quiere
          // saber; el dato ya existia pero la pantalla de exito no lo
          // repetia. Para delivery se prefiere la cotizacion de la zona (mas
          // fresca que lo que haya calculado el backend). Para retiro cae
          // directo al estimatedTime del pedido creado -- nunca a
          // deliveryFeeResult, que puede seguir cargado con la cotizacion de
          // una zona de un intento anterior si el cliente probo delivery
          // antes de cambiarse a retiro; e inventar un valor propio aca
          // (como hacia PICKUP_PREP_TIME, pensado solo para el texto antes
          // de pedir) se desincroniza en cuanto el tiempo real de
          // preparacion cambie.
          // Se le suma la demora de cocina por las mismas cuentas que hace
          // el RPC sobre los mismos numeros, asi que lo prometido aca y lo
          // guardado coinciden.
          estimatedTime:
            deliveryMethod === 'delivery'
              ? aplicarExtraARango(
                  deliveryFeeResult.estimatedMinutes || result.estimatedTime || '',
                  demoraCocina.minutosExtra
                )
              : demoraCocina.rangoRetiro || result.estimatedTime || '',
        });
      } else {
        throw new Error('No se pudo generar el código de seguimiento del pedido.');
      }
    } catch (err: any) {
      // Rollback cleanup if upload succeeded but order creation failed
      if (uploadedCleanupToken) {
        await StorageService.deletePaymentProof(uploadedCleanupToken);
      }
      const msg = err?.message || '';
      if (msg.includes('sucursal')) {
        setFormError('La sucursal seleccionada ya no está disponible. Elige otra para continuar.');
        setMostrarSucursales(true);
        // Este error si tiene una accion concreta mas abajo (elegir otra
        // sucursal en BranchPicker): llevar al banner del tope no serviria
        // de nada si el cliente no ve donde hacer el cambio.
        entregaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      mostrarError(err.message || 'Error al procesar el pedido. Intenta nuevamente.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8 min-h-screen pb-28 lg:pb-12">
      {/* Navigation Top Header */}
      {!createdOrder && (
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-xs sm:text-sm font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-rose-500" />
            <span>Volver al menú</span>
          </Link>
          <div className="text-right">
            <h1 className="font-black text-lg sm:text-xl text-white">Finalizar Pedido</h1>
            <p className="text-[11px] text-zinc-400 font-medium">Checkout Rápido NixgoFood</p>
          </div>
        </div>
      )}



      {/* Aviso de local cerrado: arriba de todo y en cada paso, para que el
          cliente no llene el formulario entero antes de enterarse. */}
      {!createdOrder && !storeStatus.isOpen && (
        <div className="bg-amber-950/50 border border-amber-700 p-4 rounded-2xl flex items-start gap-3 shadow-xl">
          <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-extrabold text-sm text-amber-200">
              Ahora mismo el local está cerrado
            </p>
            <p className="text-xs text-amber-300/90">
              {storeStatus.reason || 'Vuelve durante el horario de atención para hacer tu pedido.'}{' '}
              Tu pedido queda guardado en el carrito.
            </p>
          </div>
        </div>
      )}

      {/* Al colapsar el checkout a una sola pantalla, este banner quedo
          anidado al fondo de la seccion de pago -- un error sobre el
          nombre o la direccion (secciones de mas arriba) aparecia fuera de
          vista, y el cliente no entendia por que "Confirmar pedido" no
          avanzaba. Ahora es uno solo, siempre arriba de todo. */}
      {!createdOrder && formError && (
        <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-2xl flex items-center gap-3 text-xs sm:text-sm text-rose-300 shadow-xl">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Main Grid Layout for Checkout */}
      {!createdOrder && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          {/* Left Column: Interactive Step Views */}
          <div className="lg:col-span-7 space-y-6">
            {/* ========================================================================= */}
            {/* STEP 1: CARRITO                                                           */}
            {/* ========================================================================= */}
            {(
              <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h2 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-rose-500" />
                    <span>Tu Comanda ({cart.reduce((sum, item) => sum + item.quantity, 0)})</span>
                  </h2>
                  <span className="text-xs text-zinc-400 font-medium">Revisa tus productos</span>
                </div>

                {/* Items List */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="bg-zinc-950 p-3.5 sm:p-4 rounded-2xl border border-zinc-800 space-y-3 transition-all hover:border-zinc-700"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-zinc-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-black text-sm text-zinc-100 truncate">{item.product.name}</h3>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="w-11 h-11 shrink-0 flex items-center justify-center text-zinc-500 hover:text-rose-400 rounded-lg transition-colors"
                              title="Eliminar producto"
                              aria-label={`Quitar ${item.product.name} del pedido`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {item.selectedModifiers.length > 0 && (
                            <p className="text-[11px] text-zinc-400 leading-tight">
                              {item.selectedModifiers.map((m) => m.modifierName).join(', ')}
                            </p>
                          )}

                          <div className="text-xs font-extrabold text-amber-400 pt-0.5">
                            ${item.unitPrice.toFixed(2)} c/u
                          </div>
                        </div>
                      </div>

                      {/* Notes per Item Input */}
                      <div className="relative pt-1">
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3.5" />
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => updateItemNotes(item.id, e.target.value)}
                          placeholder="Observaciones (ej. sin cebolla, salsa aparte...)"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                      </div>

                      {/* Quantity & Subtotal Row */}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs">
                        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                          <button
                            onClick={() => updateCartItemQuantity(item.id, -1)}
                            className="p-1 rounded-lg bg-zinc-950 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-zinc-100 px-2 min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateCartItemQuantity(item.id, 1)}
                            className="p-1 rounded-lg bg-zinc-950 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-zinc-500 block font-medium">Subtotal ítem</span>
                          <span className="font-black text-sm text-white">${item.totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subtotal Summary Footer */}
                <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-sm">
                  <span className="text-zinc-400 font-bold">Subtotal de la orden</span>
                  <span className="text-amber-400 font-black text-lg">${cartSubtotal.toFixed(2)}</span>
                </div>

              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 2: ENTREGA (DELIVERY vs RETIRO)                                      */}
            {/* ========================================================================= */}
            {(
              <div className="space-y-6" ref={entregaRef}>
                {/* Avisar la demora, no esconderla: quien espera 40 min
                    sabiendolo de antemano reclama mucho menos que quien
                    creyo que eran 20. */}
                {demoraCocina.minutosExtra > 0 && (
                  <div className="bg-amber-950/50 border border-amber-800/70 p-3.5 rounded-2xl flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200">
                      <strong className="font-extrabold">Hoy con más demora de lo habitual.</strong>{' '}
                      La cocina está con mucho movimiento y los tiempos de abajo ya lo tienen en
                      cuenta.
                    </p>
                  </div>
                )}

                {/* Method Selector Cards */}
                <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-4 shadow-2xl">
                  <h2 className="font-extrabold text-base sm:text-lg text-white border-b border-zinc-800 pb-3">
                    ¿Cómo quieres recibir tu pedido?
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                        deliveryMethod === 'delivery'
                          ? 'bg-rose-950/50 border-rose-500 text-white shadow-lg shadow-rose-950/50'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          deliveryMethod === 'delivery' ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-extrabold text-sm block">🛵 Delivery a Domicilio</span>
                        <span className="text-[11px] text-zinc-400 block">Enviamos a tu ubicación exacta</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                        deliveryMethod === 'pickup'
                          ? 'bg-rose-950/50 border-rose-500 text-white shadow-lg shadow-rose-950/50'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          deliveryMethod === 'pickup' ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-zinc-400'
                        }`}
                      >
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-extrabold text-sm block">🏪 Retiro en Local</span>
                        <span className="text-[11px] text-zinc-400 block">Retiras en cocina ($0.00 envío)</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Delivery Options & Map */}
                {deliveryMethod === 'delivery' ? (
                  <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-4 shadow-2xl">
                    <h3 className="font-extrabold text-base text-white">📍 Ubicación de Entrega</h3>
                    <LocationPicker />

                    {/* Te atiende: resumen de sucursal asignada */}
                    {deliveryMethod === 'delivery' && selectedBranch && deliveryLocation.hasSelectedLocation && (
                      <div className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500 block">
                            Te atiende
                          </span>
                          <span className="font-extrabold text-sm text-white truncate block">{selectedBranch.name}</span>
                          {deliveryFeeResult.distanceKm !== undefined && (
                            <span className="text-[11px] text-zinc-400">A {deliveryFeeResult.distanceKm} km de tu dirección</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMostrarSucursales((v) => !v)}
                          className="text-[11px] font-extrabold text-amber-400 hover:text-amber-300 underline shrink-0"
                        >
                          {mostrarSucursales ? 'Cerrar' : 'Cambiar'}
                        </button>
                      </div>
                    )}
                    {mostrarSucursales && deliveryMethod === 'delivery' && <BranchPicker mode="delivery" />}
                  </div>
                ) : (
                  /* Pickup Branch Picker Card */
                  <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2 text-rose-400 font-extrabold text-base">
                        <Store className="w-5 h-5 text-rose-500" />
                        <h3>Elige la Sucursal para Retiro</h3>
                      </div>
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0">
                        Envío $0.00
                      </span>
                    </div>

                    <BranchPicker mode="pickup" />

                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs pt-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        Preparación:{' '}
                        <strong>{demoraCocina.rangoRetiro || RETIRO_POR_DEFECTO}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Customer Contact Details */}
                <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-4 shadow-2xl">
                  <h3 className="font-extrabold text-base text-white border-b border-zinc-800 pb-3">
                    Datos del Cliente
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                        Nombre Completo *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ej: Juan Pérez"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                        Teléfono / WhatsApp *
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Ej: 0991234567"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 3: MÉTODOS DE PAGO                                                   */}
            {/* ========================================================================= */}
            {(
              <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-6 shadow-2xl">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-rose-500" />
                    <span>Selecciona tu Método de Pago</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Elige la opción más conveniente para ti</p>
                </div>

                <div className="space-y-4">
                  {/* Option 1: Efectivo */}
                  <div
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-rose-950/40 border-rose-500 text-white shadow-lg'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center shrink-0">
                          <Banknote className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-black text-sm text-white block">💵 Efectivo al entregar / retirar</span>
                          <span className="text-xs text-zinc-400 block">Pagas directamente en el momento del recibo</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${paymentMethod === 'cash' ? 'border-rose-500 bg-rose-600 text-white' : 'border-zinc-700'}`}>
                        {paymentMethod === 'cash' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {/* Cash Details: Needs change inquiry */}
                    {paymentMethod === 'cash' && (
                      <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-bold text-zinc-200">¿Necesitas cambio?</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setNeedsChange(false)}
                            className={`py-2 px-3 rounded-xl border font-bold transition-all ${
                              !needsChange
                                ? 'bg-amber-500 text-zinc-950 border-amber-400'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            No necesito cambio
                          </button>

                          <button
                            type="button"
                            onClick={() => setNeedsChange(true)}
                            className={`py-2 px-3 rounded-xl border font-bold transition-all ${
                              needsChange
                                ? 'bg-amber-500 text-zinc-950 border-amber-400'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            Sí, pagaré con billete
                          </button>
                        </div>

                        {needsChange && (
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                              Indica con cuánto pagarás ($)
                            </label>
                            <input
                              type="number"
                              step="0.50"
                              value={payWithAmount}
                              onChange={(e) => setPayWithAmount(e.target.value)}
                              placeholder={`Ej: ${(Math.ceil(orderTotal / 5) * 5 || 20).toFixed(2)}`}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                            />
                            <p className="text-[10px] text-zinc-500">
                              Calcularemos tu cambio exacto: ${(parseFloat(payWithAmount) - orderTotal > 0 ? parseFloat(payWithAmount) - orderTotal : 0).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Option 2: Transferencia Bancaria */}
                  <div
                    onClick={() => setPaymentMethod('transfer')}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'transfer'
                        ? 'bg-rose-950/40 border-rose-500 text-white shadow-lg'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-black text-sm text-white block">🏦 Transferencia Bancaria Directa</span>
                          <span className="text-xs text-zinc-400 block">Transferencia a cuenta oficial del negocio</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${paymentMethod === 'transfer' ? 'border-rose-500 bg-rose-600 text-white' : 'border-zinc-700'}`}>
                        {paymentMethod === 'transfer' && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {/* Bank Info & Photo Attachment UI when transfer selected */}
                    {paymentMethod === 'transfer' && (
                      <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-amber-400 text-sm">{bankInfo.bankName}</span>
                            <button
                              type="button"
                              onClick={handleCopyAccount}
                              className="inline-flex items-center gap-1 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-zinc-700 transition-all"
                            >
                              {copiedBank ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">¡Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-amber-400" />
                                  <span>Copiar cuenta</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1 text-zinc-300 pt-1">
                            <p><strong>Tipo:</strong> {bankInfo.accountType}</p>
                            <p><strong>Número de Cuenta:</strong> <span className="font-mono text-white bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">{bankInfo.accountNumber}</span></p>
                            <p><strong>Titular:</strong> {bankInfo.accountHolder}</p>
                            {bankInfo.identification && <p><strong>RUC / CI:</strong> {bankInfo.identification}</p>}
                          </div>
                        </div>

                        {/* Photo Attachment Section */}
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-bold text-zinc-200">
                            📷 Adjuntar comprobante de pago *
                          </label>

                          {!transferProofPreviewUrl ? (
                            <label className="flex flex-col items-center justify-center gap-2 p-5 sm:p-6 rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/60 hover:bg-zinc-900 hover:border-amber-500/60 cursor-pointer transition-all text-center">
                              <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400">
                                <Camera className="w-6 h-6" />
                              </div>
                              <div>
                                <span className="font-extrabold text-xs sm:text-sm text-white block">
                                  Toma una foto o selecciona de la galería
                                </span>
                                <span className="text-[11px] text-zinc-400 block pt-0.5">
                                  Formatos permitidos: JPG, PNG, WebP (Máx. 5 MB)
                                </span>
                              </div>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleSelectProofFile}
                                className="hidden"
                              />
                            </label>
                          ) : (
                            /* Preview Card */
                            <div className="bg-zinc-900 p-3.5 rounded-2xl border border-zinc-800 space-y-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={transferProofPreviewUrl}
                                  alt="Comprobante de pago"
                                  className="w-20 h-20 rounded-xl object-cover border border-zinc-800 bg-zinc-950 shrink-0"
                                />
                                <div className="flex-1 min-w-0 space-y-1">
                                  <span className="inline-flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Comprobante adjuntado</span>
                                  </span>
                                  <p className="text-xs font-bold text-zinc-200 truncate">
                                    {transferProofFile?.name || 'comprobante_pago.jpg'}
                                  </p>
                                  <p className="text-[11px] text-zinc-400 font-mono">
                                    {transferProofFile
                                      ? `${(transferProofFile.size / (1024 * 1024)).toFixed(2)} MB`
                                      : 'Imagen cargada'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/80">
                                <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 cursor-pointer transition-all">
                                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Cambiar foto</span>
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handleSelectProofFile}
                                    className="hidden"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={handleRemoveProofFile}
                                  className="py-2 px-3 bg-zinc-950 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 text-xs font-bold rounded-xl border border-zinc-700 hover:border-rose-800 transition-all flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Eliminar</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {proofError && (
                            <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>{proofError}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

          </div>

          {/* Right Column: Sticky Summary & Breakdown (Desktop & Mobile Bar) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-zinc-900 p-4 sm:p-6 rounded-3xl border border-zinc-800 space-y-5 sticky top-24 shadow-2xl">
              <h2 className="font-extrabold text-base sm:text-lg text-white border-b border-zinc-800 pb-3">
                Resumen de Costos
              </h2>

              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Productos ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span className="font-semibold text-zinc-200">${cartSubtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Costo de Delivery</span>
                  <span className="font-semibold text-zinc-200">
                    {deliveryMethod === 'delivery'
                      ? deliveryFeeResult.available
                        ? `$${deliveryFeeResult.fee.toFixed(2)}`
                        : 'No disponible'
                      : '$0.00 (Retiro)'}
                  </span>
                </div>

                <div className="flex justify-between text-base font-black text-white pt-3 border-t border-zinc-800">
                  <span>Total a Pagar</span>
                  <span className="text-amber-400 text-xl font-mono">${orderTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-850 flex items-center gap-2.5 text-[11px] text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Garantía NixgoFood: Sin costos ocultos. Precios transparentes.</span>
              </div>

              {/* Confirm CTA -- solo en escritorio; en movil la cubre la barra fija de abajo. */}
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isSubmitting || !storeStatus.isOpen}
                className="hidden lg:inline-flex w-full items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-rose-950/60 active:scale-95 disabled:opacity-50 transition-all text-sm"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {!storeStatus.isOpen
                    ? 'Local cerrado'
                    : isSubmitting
                    ? 'Procesando comanda...'
                    : 'Confirmar pedido'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom CTA Bar (Steps 1 to 3) */}
      {!createdOrder && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 p-3 sm:p-4 shadow-2xl flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-bold">Total del Pedido</span>
            <span className="font-black text-amber-400 text-lg font-mono">${orderTotal.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={handleConfirmOrder}
            disabled={isSubmitting || !storeStatus.isOpen}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white font-extrabold py-3 px-5 rounded-xl shadow-lg text-xs sm:text-sm active:scale-95 disabled:opacity-50"
          >
            <span>
              {!storeStatus.isOpen ? 'Local cerrado' : isSubmitting ? 'Procesando...' : 'Confirmar pedido'}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 5: PANTALLA VISUAL DE ÉXITO (PEDIDO CREADO)                           */}
      {/* ========================================================================= */}
      {createdOrder && (
        <div className="max-w-2xl mx-auto py-8 sm:py-12 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-10 space-y-6 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-600" />

            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950/50">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest bg-emerald-950 text-emerald-400 border border-emerald-800 px-3.5 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>¡Pedido Recibido!</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Comanda #{createdOrder.orderNumber.replace('#', '')}</h2>
              
              {createdOrder.paymentMethod === 'transfer' ? (
                <p className="text-amber-300 text-xs sm:text-sm max-w-md mx-auto font-medium bg-amber-950/40 p-3 rounded-2xl border border-amber-800/60">
                  Tu comprobante fue adjuntado y está <strong>pendiente de verificación</strong> por el restaurante.
                </p>
              ) : (
                <p className="text-zinc-400 text-xs sm:text-sm max-w-md mx-auto">
                  Tu comanda ya se encuentra ingresada en la cocina de <strong>{business?.name || businessConfig.name}</strong>.
                </p>
              )}
            </div>

            {/* Order Summary Recap Box */}
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-3 text-left text-xs sm:text-sm">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <span className="text-zinc-400 font-bold">Estado del pedido:</span>
                <span className="bg-rose-950 text-rose-300 border border-rose-800 text-xs font-extrabold px-3 py-0.5 rounded-full uppercase">
                  Pedido Recibido
                </span>
              </div>

              {createdOrder.paymentMethod === 'transfer' && (
                <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                  <span className="text-zinc-400 font-bold">Estado de pago:</span>
                  <span className="bg-amber-950 text-amber-300 border border-amber-800 text-xs font-extrabold px-3 py-0.5 rounded-full uppercase">
                    Pendiente de verificación
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Modalidad:</span>
                <span className="font-bold text-white">
                  {createdOrder.deliveryMethod === 'delivery' ? '🛵 Delivery a Domicilio' : '🏪 Retiro en Local'}
                </span>
              </div>

              {createdOrder.estimatedTime && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tiempo estimado:</span>
                  <span className="font-bold text-white">{createdOrder.estimatedTime}</span>
                </div>
              )}

              {createdOrder.deliveryLocation && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Dirección:</span>
                  <span className="font-medium text-zinc-200 truncate max-w-[200px] sm:max-w-[300px]">
                    {createdOrder.deliveryLocation.address}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Método de Pago:</span>
                <span className="font-bold text-white uppercase">
                  {createdOrder.paymentMethod === 'cash' ? '💵 Efectivo' : '🏦 Transferencia'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-850 font-bold">
                <span className="text-zinc-300">Total:</span>
                <span className="text-amber-400 text-base font-black">${createdOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push(`/order/${createdOrder.trackingToken}`)}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl active:scale-95 transition-all text-xs sm:text-sm"
              >
                <span>Ver estado de mi pedido</span>
                <ExternalLink className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full inline-flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 font-bold py-4 px-6 rounded-2xl border border-zinc-800 transition-all text-xs sm:text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
