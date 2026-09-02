'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

interface RealMapWrapperProps {
  customerLat: number;
  customerLng: number;
  branchLat: number;
  branchLng: number;
  branchName: string;
  hasSelectedLocation: boolean;
  onPositionChange: (lat: number, lng: number) => void;
}

// Dynamically import Leaflet RealMap with SSR disabled
const RealMapNoSSR = dynamic(() => import('./RealMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-950 rounded-2xl border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 space-y-2">
      <div className="w-8 h-8 rounded-full bg-rose-950/60 border border-rose-600 flex items-center justify-center text-rose-400 animate-bounce">
        <MapPin className="w-4 h-4" />
      </div>
      <span className="text-xs font-semibold">Cargando mapa interactivo...</span>
    </div>
  ),
});

export const RealMapWrapper: React.FC<RealMapWrapperProps> = (props) => {
  return <RealMapNoSSR {...props} />;
};
