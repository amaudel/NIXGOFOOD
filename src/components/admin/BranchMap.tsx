'use client';

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface BranchMapProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
}

// Re-centra el mapa cuando cambian las coordenadas de la sucursal
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Permite ubicar la sucursal haciendo click en el mapa
function MapClickListener({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export const BranchMap: React.FC<BranchMapProps> = ({ latitude, longitude, onPositionChange }) => {
  // Mismo divIcon que RealMap.tsx: evita problemas con las URLs de assets rotas de Leaflet en Next.js
  const restaurantIcon = useMemo(
    () =>
      L.divIcon({
        className: 'custom-leaflet-restaurant-icon',
        html: `
          <div style="background-color: #e11d48; color: white; width: 36px; height: 36px; rounded: 50%; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: 3px solid #09090b; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.4 1.4a3 3 0 0 0 4.2 0L22 7.6"/><path d="M15 9 9 15"/><path d="M9 11 3 5"/><path d="m6 13-2 2a3 3 0 0 0 0 4.2l1.4 1.4a3 3 0 0 0 4.2 0l2-2"/><path d="M12 15 6 21"/></svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    []
  );

  const eventHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const marker = e.target;
        const position = marker.getLatLng();
        onPositionChange(position.lat, position.lng);
      },
    }),
    [onPositionChange]
  );

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        scrollWheelZoom={false}
        className="w-full h-full rounded-2xl overflow-hidden"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap lat={latitude} lng={longitude} />

        <MapClickListener onPositionChange={onPositionChange} />

        <Marker
          position={[latitude, longitude]}
          icon={restaurantIcon}
          draggable={true}
          eventHandlers={eventHandlers}
        >
          <Popup className="font-bold text-xs text-zinc-900">🏢 Ubicación de la sucursal</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default BranchMap;
