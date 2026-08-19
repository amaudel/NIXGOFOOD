'use client';

import React, { useState } from 'react';
import { Undo2, X, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Order, OrderStatus, AdminRole } from '@/types';

interface RollbackOrderModalProps {
  order: Order | null;
  previousStatus: OrderStatus | null;
  userRole?: AdminRole;
  onConfirm: (order: Order, previousStatus: OrderStatus, reason: string) => Promise<void>;
  onClose: () => void;
}

const getStatusLabel = (s: OrderStatus): string => {
  switch (s) {
    case 'new':
      return 'Nuevo';
    case 'preparing':
      return 'En preparación';
    case 'ready':
      return 'Listo';
    case 'on_the_way':
      return 'En camino';
    case 'delivered':
      return 'Entregado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return s;
  }
};

const REASON_OPTIONS = [
  'Marcado por error',
  'Pedido aún no está listo',
  'Error operativo en cocina',
  'Otro motivo',
];

export const RollbackOrderModal: React.FC<RollbackOrderModalProps> = ({
  order,
  previousStatus,
  userRole = 'admin',
  onConfirm,
  onClose,
}) => {
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>(REASON_OPTIONS[0]);
  const [customReasonText, setCustomReasonText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!order || !previousStatus) return null;

  const isDeliveredRollback = order.status === 'delivered';
  const isOperator = userRole === 'operator';
  const isBlocked = isDeliveredRollback && isOperator;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalReason =
      selectedReasonOption === 'Otro motivo'
        ? customReasonText.trim()
        : selectedReasonOption;

    if (isDeliveredRollback && finalReason.length < 3) {
      setError('Debes ingresar un motivo obligatorio para reabrir un pedido entregado.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm(order, previousStatus, finalReason || 'Retroceso de estado');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al revertir el estado del pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-700 flex items-center justify-center text-amber-400">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">
                {isDeliveredRollback ? '⚠️ REABRIR PEDIDO ENTREGADO' : '↩ REGRESAR ESTADO DEL PEDIDO'}
              </h3>
              <p className="text-xs text-zinc-400 font-medium">{order.orderNumber} · {order.customer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access Blocked Warning for Operators on Delivered Orders */}
        {isBlocked ? (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-950 border border-rose-800 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-white text-sm">Acción Reservada para Administradores</h4>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                Los pedidos entregados solo pueden ser reabiertos por un <strong>Admin</strong> o <strong>Propietario</strong> del restaurante.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold text-xs"
            >
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Status Transition Visual Banner */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 text-center">
              <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider block">
                Transición de Retroceso:
              </span>
              <div className="flex items-center justify-center gap-3 font-black text-sm">
                <span className="px-3 py-1 rounded-xl bg-rose-950 text-rose-300 border border-rose-800">
                  {getStatusLabel(order.status)}
                </span>
                <span className="text-amber-400">➔</span>
                <span className="px-3 py-1 rounded-xl bg-amber-950 text-amber-300 border border-amber-800">
                  {getStatusLabel(previousStatus)}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 pt-1">
                El cliente y los demás paneles KDS verán el cambio a <strong className="text-amber-300">{getStatusLabel(previousStatus)}</strong> en tiempo real.
              </p>
            </div>

            {/* Reason Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 block">
                Motivo del retroceso {isDeliveredRollback ? <span className="text-rose-400 font-black">(Obligatorio)</span> : '(Opcional)'}:
              </label>

              <div className="space-y-1.5">
                {REASON_OPTIONS.map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                      selectedReasonOption === opt
                        ? 'bg-amber-950/40 border-amber-600 text-amber-200'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rollback_reason"
                      checked={selectedReasonOption === opt}
                      onChange={() => setSelectedReasonOption(opt)}
                      className="accent-amber-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

              {(selectedReasonOption === 'Otro motivo' || isDeliveredRollback) && (
                <textarea
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  placeholder={isDeliveredRollback ? 'Especifica el motivo de reapertura del pedido entregado...' : 'Escribe el motivo...'}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 mt-2"
                />
              )}
            </div>

            {/* Error Feedback */}
            {error && (
              <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-zinc-950 border border-zinc-800 font-bold text-zinc-300 hover:text-white text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 font-black text-zinc-950 text-xs shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Undo2 className="w-4 h-4" />
                    <span>Regresar a {getStatusLabel(previousStatus)}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
