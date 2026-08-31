'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, AlertCircle, CheckCircle, Settings } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoBusinessRepository } from '@/repositories/demo/DemoBusinessRepository';
import { useApp } from '@/context/AppContext';

export default function SettingsBusinessClientPage() {
  const { businessId } = useApp();
  const [name, setName] = useState('El Taca Nijo');
  const [description, setDescription] = useState('Sabor que provoca volver.');
  const [phone, setPhone] = useState('0991234567');
  const [whatsapp, setWhatsapp] = useState('0991234567');
  const [currency, setCurrency] = useState('USD');
  const [primaryColor, setPrimaryColor] = useState('#e11d48');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isDemo = isDemoMode();

  // Load existing business and branch data
  useEffect(() => {
    async function loadData() {
      if (isDemo) {
        const biz = await DemoBusinessRepository.getBusiness();
        if (biz) {
          setName(biz.name);
          setDescription(biz.description || '');
          setPhone(biz.phone);
          setWhatsapp(biz.whatsapp || '');
          setCurrency(biz.currency);
          setPrimaryColor(biz.primaryColor);
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
          .eq('id', businessId)
          .single();

        if (biz) {
          setName(biz.name || 'El Taca Nijo');
          setDescription(biz.description || '');
          setPhone(biz.phone || '0991234567');
          setWhatsapp(biz.whatsapp || '0991234567');
          setCurrency(biz.currency || 'USD');
          setPrimaryColor(biz.primary_color || '#e11d48');
        }
      } catch (err) {
        console.error('Error loading business settings:', err);
      }
    }

    loadData();
  }, [isDemo, businessId]);

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

        setMessage({ type: 'success', text: '✓ Datos del negocio guardados localmente (Modo Demo).' });
        setSaving(false);
        return;
      }

      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'
      ) {
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
        .eq('id', businessId);

      if (bizErr) throw new Error(bizErr.message);

      setMessage({ type: 'success', text: '✓ Datos del negocio guardados exitosamente.' });
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
            <span>Configuración del Negocio</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Administra los datos generales de tu negocio: marca, contacto y moneda.
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

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between gap-3 shadow-xl">
            <div>
              <h2 className="font-extrabold text-base text-white">Sucursales</h2>
              <p className="text-xs text-zinc-400">
                La dirección, coordenadas y horarios de cada sucursal se administran en su propia pantalla.
              </p>
            </div>
            <Link
              href="/admin/branches"
              className="shrink-0 text-xs font-extrabold text-amber-400 hover:text-amber-300 underline"
            >
              Gestionar sucursales →
            </Link>
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
