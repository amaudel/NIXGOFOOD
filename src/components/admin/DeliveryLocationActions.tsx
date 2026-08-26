'use client';

import React from 'react';
import { MapPin, MessageCircle } from 'lucide-react';
import { DeliveryLocation } from '@/types';

interface DeliveryLocationActionsProps {
  deliveryLocation: DeliveryLocation;
  customerName?: string;
}

export const DeliveryLocationActions: React.FC<DeliveryLocationActionsProps> = ({
  deliveryLocation,
  customerName,
}) => {
  const { latitude, longitude, address } = deliveryLocation;

  if (!latitude || !longitude) return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const whatsappText = encodeURIComponent(
    `📍 Ubicación de entrega${customerName ? ` - ${customerName}` : ''}:\n${address}\n${mapsUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`;

  return (
    <div className="flex items-center gap-2 pt-1">
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-[11px] font-bold py-2 px-3 rounded-xl border border-zinc-700 transition-all active:scale-95"
      >
        <MapPin className="w-3.5 h-3.5 text-rose-400" />
        Ver en mapa
      </a>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-bold py-2 px-3 rounded-xl border border-emerald-800 transition-all active:scale-95"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Enviar al motorizado
      </a>
    </div>
  );
};
