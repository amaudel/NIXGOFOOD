'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Lock, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { businessConfig } from '@/config/business';
import { isDemoMode } from '@/config/demo';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isDemo = isDemoMode();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isDemo) {
        // Local demo mode authentication
        router.push('/admin');
        router.refresh();
        return;
      }

      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        throw new Error(authError.message || 'Credenciales incorrectas.');
      }

      if (data.user) {
        router.push('/admin');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = () => {
    router.push('/admin');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-lg shadow-rose-950/50">
            <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-amber-400" />
            </div>
          </div>

          <h1 className="text-2xl font-black text-white">Acceso Administrativo</h1>
          <p className="text-xs text-zinc-400">{businessConfig.name} · Panel Operativo</p>

          {isDemo && (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest bg-amber-950/80 text-amber-300 border border-amber-800 px-3 py-1 rounded-full">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Modo Demostración Activo</span>
            </span>
          )}
        </div>

        {/* Quick Demo Access Button if Demo Mode */}
        {isDemo && (
          <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-2xl space-y-3 text-center">
            <p className="text-xs text-amber-200">
              Estás navegando en la versión de demostración comercial. No necesitas ingresar credenciales.
            </p>
            <button
              onClick={handleDemoAccess}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-zinc-950 font-black py-3 px-4 rounded-xl shadow-lg transition-all text-xs"
            >
              <span>Entrar a la Demostración Comercial</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Standard Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required={!isDemo}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@eltacanijo.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required={!isDemo}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-xl shadow-rose-950/60 active:scale-95 disabled:opacity-50 transition-all text-sm"
          >
            <span>{loading ? 'Iniciando sesión...' : 'Ingresar al Panel'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[11px] text-zinc-500 text-center">
          Acceso administrable del negocio.
        </p>
      </div>
    </div>
  );
}
