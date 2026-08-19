'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Navigation, Settings } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { RealMapWrapper } from '@/components/RealMapWrapper';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID, activeBranch } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';

export default function SettingsBusinessClientPage() {
  const [name, setName] = useState('El Taca Nijo');
  const [description, setDescription] = useState('Sabor que provoca volver.');
  const [phone, setPhone] = useState('0991234567');
  const [whatsapp, setWhatsapp] = useState('0991234567');
  const [currency, setCurrency] = useState('USD');
  const [primaryColor, setPrimaryColor] = useState('#e11d48');

  // Branch details
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('El Taca Nijo - Matriz');
  const [branchAddress, setBranchAddress] = useState('Av. Los Shyris y Naciones Unidas, Quito');
  const [latitude, setLatitude] = useState(activeBranch.latitude);
  const [longitude, setLongitude] = useState(activeBranch.longitude);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isDemo = isDemoMode();

  // Load existing business and branch data
  useEffect(() => {
    async function loadData() {
      if (isDemo) {
        const biz = await DemoBusinessRepository.getBusiness();
        const br = await DemoBusinessRepository.getBranch();
        if (biz) {
          setName(biz.name);
          setDescription(biz.description || '');
          setPhone(biz.phone);
          setWhatsapp(biz.whatsapp || '');
          setCurrency(biz.currency);
          setPrimaryColor(biz.primaryColor);
        }
        if (br) {
          setBranchId(br.id);
          setBranchName(br.name);
          setBranchAddress(br.address);
          setLatitude(br.latitude);
          setLongitude(br.longitude);
        }
        return;
      }

      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
        return;
      }

      try {
        const supabase = createClient();

        // Business
        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', CURRENT_BUSINESS_ID)
          .single();

        if (biz) {
          setName(biz.name || 'El Taca Nijo');
          setDescription(biz.description || '');
          setPhone(biz.phone || '0991234567');
          setWhatsapp(biz.whatsapp || '0991234567');
          setCurrency(biz.currency || 'USD');
          setPrimaryColor(biz.primary_color || '#e11d48');
        }

        // Branch
        const { data: br } = await supabase
          .from('branches')
          .select('*')
          .eq('business_id', CURRENT_BUSINESS_ID)
          .single();

        if (br) {
          setBranchId(br.id);
          setBranchName(br.name);
          setBranchAddress(br.address);
          setLatitude(parseFloat(br.latitude));
          setLongitude(parseFloat(br.longitude));
        }
      } catch (err) {
        console.error('Error loading business settings:', err);
      }
    }

    loadData();
  }, [isDemo]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
      },
      (err) => {
        alert(`Error al obtener ubicación: ${err.message}`);
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      if (isDemo) {
        await DemoBusinessRepository.saveBusiness({
          name: name.trim(),
          description: description.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          currency: currency.trim(),
          primaryColor: primaryColor,
        });

        await DemoBusinessRepository.saveBranch({
          name: branchName.trim(),
          address: branchAddress.trim(),
          latitude: latitude,
          longitude: longitude,
        });

        // Sync local memory activeBranch for immediate delivery calculations
        activeBranch.latitude = latitude;
        activeBranch.longitude = longitude;
        activeBranch.address = branchAddress;

        setMessage({ type: 'success', text: '✓ Datos del negocio y ubicación de sucursal guardados localmente (Modo Demo).' });
        setSaving(false);
        return;
      }

      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
        activeBranch.latitude = latitude;
        activeBranch.longitude = longitude;
        activeBranch.address = branchAddress;
        setMessage({ type: 'success', text: '✓ Configuración actualizada localmente.' });
        setSaving(false);
        return;
      }

      const supabase = createClient();

      // Update Business
      const { error: bizErr } = await supabase
        .from('businesses')
        .update({
          name: name.trim(),
          description: description.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          currency: currency.trim(),
          primary_color: primaryColor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', CURRENT_BUSINESS_ID);

      if (bizErr) throw new Error(bizErr.message);

      // Update Branch (Origin of Delivery)
      if (branchId) {
        const { error: brErr } = await supabase
          .from('branches')
          .update({
            name: branchName.trim(),
            address: branchAddress.trim(),
            latitude,
            longitude,
            updated_at: new Date().toISOString(),
          })
          .eq('id', branchId);

        if (brErr) throw new Error(brErr.message);
      }

      // Sync local memory activeBranch for immediate delivery calculations
      activeBranch.latitude = latitude;
      activeBranch.longitude = longitude;
      activeBranch.address = branchAddress;

      setMessage({ type: 'success', text: '✓ Datos del negocio y ubicación de sucursal guardados exitosamente.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar cambios.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-rose-500" />
            <span>Configuración del Negocio & Sucursal</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Administra los datos generales y fija la ubicación exacta del restaurante usada para el cálculo de delivery.
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Business Info Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h2 className="font-extrabold text-base text-white border-b border-zinc-800 pb-3">
              Información General del Negocio
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Nombre del Restaurante *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Moneda
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  WhatsApp
                </label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Descripción corta
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Branch Location Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="font-extrabold text-base text-white">Ubicación Origen de la Sucursal</h2>
                <p className="text-xs text-zinc-400">
                  Esta posición es la referencia oficial desde la cual `DeliveryService` calcula las distancias.
                </p>
              </div>

              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-rose-400 transition-all"
              >
                <Navigation className="w-4 h-4" />
                <span>📍 Usar mi ubicación actual</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Nombre de Sucursal *
                </label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Dirección Escrita *
                </label>
                <input
                  type="text"
                  required
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Interactive Leaflet Map for Branch Location */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                Mueve el pin o haz clic en el mapa para ajustar la ubicación del restaurante
              </span>

              <div className="relative w-full h-72 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950">
                <RealMapWrapper
                  customerLat={latitude}
                  customerLng={longitude}
                  branchLat={latitude}
                  branchLng={longitude}
                  branchName={branchName}
                  onPositionChange={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                />
              </div>

              <p className="text-[11px] text-zinc-500 text-center font-mono">
                Coordenadas origen: {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl shadow-rose-950/60 active:scale-95 disabled:opacity-50 transition-all text-base"
          >
            <Save className="w-5 h-5" />
            <span>{saving ? 'Guardando cambios...' : 'Guardar Configuración'}</span>
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
