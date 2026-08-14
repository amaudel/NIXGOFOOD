'use client';

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RealMapProps {
  customerLat: number;
  customerLng: number;
  branchLat: number;
  branchLng: number;
  branchName: string;
  onPositionChange: (lat: number, lng: number) => void;
}

// Component to dynamically re-center map view when coordinates change
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Component to handle map clicks and place marker
function MapClickListener({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export const RealMap: React.FC<RealMapProps> = ({
  customerLat,
  customerLng,
  branchLat,
  branchLng,
  branchName,
  onPositionChange,
}) => {
  // Custom styled Leaflet DivIcons to avoid broken asset URL issues in Next.js bundler
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

  const customerPinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'custom-leaflet-customer-icon',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="background-color: #f59e0b; color: #09090b; width: 40px; height: 40px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: 3px solid #09090b; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.7); cursor: grab;">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#09090b" stroke="#09090b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#f59e0b"/></svg>
            </div>
            <div style="width: 10px; height: 10px; background-color: rgba(245, 158, 11, 0.4); border-radius: 50%; margin-top: 2px;"></div>
          </div>
        `,
        iconSize: [40, 52],
        iconAnchor: [20, 52],
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
        center={[customerLat, customerLng]}
        zoom={14}
        scrollWheelZoom={false}
        className="w-full h-full rounded-2xl overflow-hidden"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Recenter Map when customer location updates */}
        <RecenterMap lat={customerLat} lng={customerLng} />

        {/* Map Click Listener */}
        <MapClickListener onPositionChange={onPositionChange} />

        {/* Restaurant Branch Marker */}
        <Marker position={[branchLat, branchLng]} icon={restaurantIcon}>
          <Popup className="font-bold text-xs text-zinc-900">
            🏢 {branchName}
          </Popup>
        </Marker>

        {/* Customer Target Marker (Draggable) */}
        <Marker
          position={[customerLat, customerLng]}
          icon={customerPinIcon}
          draggable={true}
          eventHandlers={eventHandlers}
        >
          <Popup className="font-semibold text-xs text-zinc-900">
            📍 Tu entrada de domicilio
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default RealMap;
