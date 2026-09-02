'use client';

import React, { useRef, useState } from 'react';
import {
  MapPin,
  Navigation,
  Home,
  Building,
  Briefcase,
  Store,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
} from 'lucide-react';
import { LocationType } from '@/types';
import { useApp } from '@/context/AppContext';
import { useBranch } from '@/context/BranchContext';
import { RealMapWrapper } from '@/components/RealMapWrapper';

export const LocationPicker: React.FC = () => {
  const {
    deliveryLocation,
    setDeliveryLocation,
    deliveryFeeResult,
    setDeliveryMethod,
  } = useApp();
  const { selectedBranch, branches } = useBranch();
  const sucursalMapa = selectedBranch || branches[0];

  const [address, setAddress] = useState(deliveryLocation.address);
  const [reference, setReference] = useState(deliveryLocation.reference || '');
  const [locationType, setLocationType] = useState<LocationType>(deliveryLocation.locationType);

  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);

  // Solo se autocompleta la direccion mientras el cliente no haya escrito la
  // suya. Una direccion escrita a mano ("Casa de mi mama, junto a la tienda")
  // suele guiar mejor al repartidor que la calle formal, y pisarla seria
  // exactamente el problema que traia el boton de GPS.
  const direccionEsAutomatica = useRef(!deliveryLocation.address);

  // Ultimo deliveryLocation conocido, para que completarDireccion pueda leer
  // el estado mas fresco cuando su fetch resuelve en vez de un valor
  // capturado por closure en el momento en que empezo la busqueda -- sin
  // esto, si el cliente escribia la referencia mientras la geocodificacion
  // seguia en curso, la respuesta la pisaba con el valor vacio de antes.
  const deliveryLocationRef = useRef(deliveryLocation);
  deliveryLocationRef.current = deliveryLocation;

  // Se incrementa en cada posicion nueva. completarDireccion guarda el
  // numero vigente al arrancar y lo compara al terminar: si el cliente ya
  // movio el pin de nuevo mientras la respuesta viajaba, esta quedo vieja y
  // se descarta -- sin esto, dos posiciones seguidas con respuestas fuera de
  // orden dejaban el pin visualmente en la mas nueva pero la direccion (y la
  // cotizacion) de la mas vieja.
  const generacionPosicion = useRef(0);

  // Unico camino que marca la ubicacion como elegida: GPS, clic en el mapa o
  // pin arrastrado. setDeliveryLocation se encarga de cotizar y de persistir.
  const updatePosition = (newLat: number, newLng: number) => {
    setGeoError(null);
    generacionPosicion.current += 1;
    const miGeneracion = generacionPosicion.current;

    setDeliveryLocation({
      latitude: newLat,
      longitude: newLng,
      address,
      reference,
      locationType,
      hasSelectedLocation: true,
    });

    if (!direccionEsAutomatica.current) return;
    void completarDireccion(newLat, newLng, miGeneracion);
  };

  // Geocodificacion inversa via ruta propia (ver src/app/api/geocode/reverse).
  // Si falla o no hay calle, el campo queda vacio a proposito: la validacion
  // del checkout le pide la direccion al cliente. Antes se guardaba
  // "Ubicacion GPS (-2.9050, -79.0120)", que es lo que terminaba leyendo el
  // repartidor.
  const completarDireccion = async (lat: number, lng: number, miGeneracion: number) => {
    setBuscandoDireccion(true);
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const data = await res.json();
      if (
        !data.address ||
        !direccionEsAutomatica.current ||
        miGeneracion !== generacionPosicion.current
      ) {
        return;
      }
      setAddress(data.address);
      setDeliveryLocation({ ...deliveryLocationRef.current, address: data.address });
    } catch {
      // Sin direccion automatica; el cliente la escribe a mano.
    } finally {
      if (miGeneracion === generacionPosicion.current) setBuscandoDireccion(false);
    }
  };

  // Real Geolocation using navigator.geolocation
  const handleUseMyLocation = () => {
    if (isLocating) return;
    setGeoError(null);
    setIsLocating(true);

    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización. Selecciona tu ubicación manualmente en el mapa.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        updatePosition(latitude, longitude);
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError('No pudimos acceder a tu ubicación. Puedes habilitar el permiso o seleccionar tu ubicación manualmente en el mapa.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError('La señal de ubicación no está disponible actualmente.');
            break;
          case error.TIMEOUT:
            setGeoError('La ubicación está tardando demasiado. Intenta nuevamente o selecciona tu ubicación manualmente.');
            break;
          default:
            setGeoError('Ocurrió un error al obtener la ubicación. Selecciona manualmente tu ubicación.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  const handleAddressChange = (newAddr: string) => {
    direccionEsAutomatica.current = false;
    setAddress(newAddr);
    setDeliveryLocation({
      ...deliveryLocation,
      address: newAddr,
    });
  };

  const handleReferenceChange = (newRef: string) => {
    setReference(newRef);
    setDeliveryLocation({
      ...deliveryLocation,
      reference: newRef,
    });
  };

  const handleTypeChange = (type: LocationType) => {
    setLocationType(type);
    setDeliveryLocation({
      ...deliveryLocation,
      locationType: type,
    });
  };

  const quote = deliveryFeeResult;

  return (
    <div className="space-y-6">
      {/* Geolocation Button */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-950/40 active:scale-95 transition-all text-sm sm:text-base disabled:opacity-60"
        >
          <Navigation className={`w-5 h-5 ${isLocating ? 'animate-spin' : ''}`} />
          <span>{isLocating ? 'Obteniendo tu ubicación...' : '📍 Usar mi ubicación'}</span>
        </button>

        {/* Geolocation Error Alert */}
        {geoError && (
          <div className="bg-amber-950/40 border border-amber-800 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{geoError}</span>
          </div>
        )}
      </div>

      {/* Real Interactive Leaflet Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
          <span>Mapa interactivo real (OpenStreetMap)</span>
          <span className="text-rose-400 font-bold">
            {deliveryLocation.hasSelectedLocation ? 'Pin arrastrable' : 'Toca para marcar'}
          </span>
        </div>

        <div className="relative w-full h-72 sm:h-80 rounded-3xl overflow-hidden border-2 border-zinc-800 shadow-2xl bg-zinc-950">
          <RealMapWrapper
            customerLat={deliveryLocation.latitude}
            customerLng={deliveryLocation.longitude}
            branchLat={sucursalMapa.latitude}
            branchLng={sucursalMapa.longitude}
            branchName={sucursalMapa.name}
            hasSelectedLocation={!!deliveryLocation.hasSelectedLocation}
            onPositionChange={(lat, lng) => updatePosition(lat, lng)}
          />

          {/* Map Overlay Coordinates Indicator */}
          <div className="absolute bottom-2 left-2 z-10 bg-zinc-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1.5 shadow">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {deliveryLocation.hasSelectedLocation
                ? `Coordenadas: ${deliveryLocation.latitude.toFixed(4)}, ${deliveryLocation.longitude.toFixed(4)}`
                : 'Toca el mapa para marcar tu domicilio'}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 text-center italic font-medium">
          {deliveryLocation.hasSelectedLocation
            ? 'Mueve el pin hasta la entrada exacta de tu domicilio.'
            : 'Toca el mapa en tu domicilio para calcular el envío.'}
        </p>
      </div>

      {/* Delivery Fee Quote Banner (Unselected / Available / Out of Coverage) */}
      <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
        {!deliveryLocation.hasSelectedLocation || quote.isUnselected ? (
          <div className="flex items-center gap-2.5 text-amber-300 text-xs py-1">
            <Compass className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="font-bold text-sm text-amber-200">Selecciona tu ubicación para calcular el delivery</p>
              <p className="text-zinc-400 text-xs">Haz clic en el mapa o mueve el pin hasta tu dirección en Cuenca.</p>
            </div>
          </div>
        ) : quote.available ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>📍 Ubicación encontrada · {quote.zoneName}</span>
              </div>
              {quote.distanceKm !== undefined && (
                <span className="text-xs text-zinc-400 font-semibold">
                  Distancia aprox: <strong className="text-amber-400">{quote.distanceKm.toFixed(1)} km</strong>
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <Clock className="w-4 h-4 text-rose-400" />
                <span>Tiempo estimado: <strong className="text-white font-bold">{quote.estimatedMinutes}</strong></span>
              </div>

              <div className="text-right">
                <span className="text-xs text-zinc-400 block">Costo Delivery</span>
                <span className="text-lg font-black text-amber-400">${quote.fee.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 text-rose-400 text-xs">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-rose-300">Esta ubicación está fuera de nuestra zona de delivery.</p>
                <p className="text-zinc-400 text-xs">{quote.reason || 'Máximo 6.0 km desde el restaurante.'}</p>
                {quote.distanceKm !== undefined && (
                  <p className="text-zinc-500 text-[11px] pt-0.5">Distancia calculada: {quote.distanceKm.toFixed(1)} km</p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="w-full sm:w-auto flex-1 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all text-center"
              >
                Cambiar ubicación
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod('pickup')}
                className="w-full sm:w-auto flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-xl transition-all text-center"
              >
                Retirar en local ($0.00)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Location Details Form */}
      <div className="space-y-4">
        {/* Address Field */}
        <div className="space-y-1.5">
          <label htmlFor="input-address" className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Dirección principal *
            {buscandoDireccion && (
              <span className="ml-2 normal-case font-medium text-amber-400">
                buscando tu calle...
              </span>
            )}
          </label>
          <input
            id="input-address"
            type="text"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            placeholder="Ej: Av. 6 de Diciembre N34-120"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>

        {/* Reference Field */}
        <div className="space-y-1.5">
          <label htmlFor="input-reference" className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Referencia de entrega
          </label>
          <input
            id="input-reference"
            type="text"
            value={reference}
            onChange={(e) => handleReferenceChange(e.target.value)}
            placeholder="Ej: Casa blanca, puerta negra, junto a farmacia"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>

        {/* Location Type Option Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Tipo de lugar
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { type: 'Casa', icon: Home },
              { type: 'Departamento', icon: Building },
              { type: 'Oficina', icon: Briefcase },
              { type: 'Local comercial', icon: Store },
            ].map(({ type, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type as LocationType)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all gap-1.5 ${
                  locationType === type
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
