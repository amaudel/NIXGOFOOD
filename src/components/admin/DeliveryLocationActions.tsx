'use client';

import React, { useState } from 'react';
import { MapPin, MessageCircle, ChevronDown } from 'lucide-react';
import { DeliveryLocation, Motorizado } from '@/types';

interface DeliveryLocationActionsProps {
  deliveryLocation: DeliveryLocation;
  customerName?: string;
  motorizados?: Motorizado[];
}

function buildWhatsappUrl(phone: string | null | undefined, text: string): string {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const DeliveryLocationActions: React.FC<DeliveryLocationActionsProps> = ({
  deliveryLocation,
  customerName,
  motorizados = [],
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { latitude, longitude, address } = deliveryLocation;

  if (!latitude || !longitude) return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const whatsappText = encodeURIComponent(
    `📍 Ubicación de entrega${customerName ? ` - ${customerName}` : ''}:\n${address}\n${mapsUrl}`
  );

  const activos = motorizados.filter((m) => m.active !== false);

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

      {activos.length > 1 ? (
        <div className="relative flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-bold py-2 px-3 rounded-xl border border-emerald-800 transition-all active:scale-95"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Enviar al motorizado</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl"
              >
                {activos.map((m) => (
                  <a
                    key={m.id}
                    href={buildWhatsappUrl(m.whatsapp, whatsappText)}
                    target="nixgofood-whatsapp"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-900 hover:text-emerald-300 truncate"
                  >
                    {m.name}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <a
          href={buildWhatsappUrl(activos[0]?.whatsapp, whatsappText)}
          target="nixgofood-whatsapp"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-bold py-2 px-3 rounded-xl border border-emerald-800 transition-all active:scale-95"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="truncate">{activos[0] ? `Enviar a ${activos[0].name}` : 'Enviar al motorizado'}</span>
        </a>
      )}
    </div>
  );
};
