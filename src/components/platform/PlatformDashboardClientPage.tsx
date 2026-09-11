'use client';

import { Fragment, useEffect, useState } from 'react';

interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  agentPersona: string | null;
  agentFaq: string | null;
  ordersLast7d: number;
  reservationsLast7d: number;
}

interface HealthState {
  loading: boolean;
  ready?: boolean;
  checks?: { label: string; ok: boolean; required: boolean; detail: string }[];
}

export default function PlatformDashboardClientPage() {
  const [businesses, setBusinesses] = useState<PlatformBusiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { agentPersona: string; agentFaq: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/businesses')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setBusinesses(data.businesses);
        const initialDrafts: Record<string, { agentPersona: string; agentFaq: string }> = {};
        for (const b of data.businesses as PlatformBusiness[]) {
          initialDrafts[b.id] = { agentPersona: b.agentPersona || '', agentFaq: b.agentFaq || '' };
          setHealth((prev) => ({ ...prev, [b.id]: { loading: true } }));
          fetch(`/api/platform/businesses/${b.id}/health?slug=${encodeURIComponent(b.slug)}`)
            .then((r) => r.json())
            .then((h) => setHealth((prev) => ({ ...prev, [b.id]: { loading: false, ready: h.ready, checks: h.checks } })))
            .catch(() => setHealth((prev) => ({ ...prev, [b.id]: { loading: false, ready: false } })));
        }
        setDrafts(initialDrafts);
      })
      .catch(() => setError('No se pudo cargar la lista de negocios.'));
  }, []);

  async function save(businessId: string) {
    setSaving(businessId);
    const draft = drafts[businessId];
    await fetch(`/api/platform/businesses/${businessId}/agent-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentPersona: draft.agentPersona || null, agentFaq: draft.agentFaq || null }),
    });
    setSaving(null);
  }

  if (error) return <div style={{ padding: 24 }}>Error: {error}</div>;
  if (!businesses) return <div style={{ padding: 24 }}>Cargando...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Panel de Administración de la Plataforma
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gestión multinegocio, diagnóstico de agentes IA y configuración de personalidad y FAQ.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-6">Negocio</th>
                  <th className="py-4 px-4">Estado</th>
                  <th className="py-4 px-4">Salud del Agente</th>
                  <th className="py-4 px-4">Pedidos (7d)</th>
                  <th className="py-4 px-4">Reservas (7d)</th>
                  <th className="py-4 px-6 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {businesses.map((b) => {
                  const h = health[b.id];
                  const isExpanded = expanded === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-4 px-6 font-bold text-white text-base">
                          {b.name}
                          <span className="block text-xs font-normal text-zinc-500">{b.slug}</span>
                        </td>
                        <td className="py-4 px-4">
                          {b.active ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-800">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {h?.loading ? (
                            <span className="text-zinc-500 text-xs animate-pulse">Verificando...</span>
                          ) : h?.ready === undefined ? (
                            <span className="text-zinc-400 text-xs">❓ Salud desconocida</span>
                          ) : h.ready ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                              🟢 Listo para operar
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                              🔴 Con observaciones
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-semibold text-zinc-200">{b.ordersLast7d}</td>
                        <td className="py-4 px-4 font-semibold text-zinc-200">{b.reservationsLast7d}</td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : b.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-all border bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700 shadow-sm active:scale-95"
                          >
                            {isExpanded ? 'Cerrar Edición' : '✏️ Editar Tono / FAQ'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-6 bg-zinc-950/90 border-t border-b border-zinc-800">
                            <div className="max-w-4xl mx-auto space-y-6">
                              {/* Diagnóstico de Salud */}
                              {h?.checks && (
                                <div className="bg-zinc-900/90 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    Diagnóstico del Agente IA
                                  </h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                    {h.checks.map((c) => (
                                      <div
                                        key={c.label}
                                        className={`flex items-start gap-2 p-2 rounded-lg border ${
                                          c.ok
                                            ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-300'
                                            : c.required
                                            ? 'bg-red-950/30 border-red-900/50 text-red-300'
                                            : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
                                        }`}
                                      >
                                        <span>{c.ok ? '✅' : c.required ? '❌' : '⚠️'}</span>
                                        <div>
                                          <span className="font-bold">{c.label}:</span>{' '}
                                          <span className="opacity-90">{c.detail}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Formulario de Edición de Tono y FAQ */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <label className="block text-xs font-bold text-zinc-200 uppercase tracking-wider">
                                    🎭 Tono / Personalidad del Agente (`agent_persona`)
                                  </label>
                                  <p className="text-xs text-zinc-400">
                                    Define la voz del bot (ej: "Eres un mesero amable de El Taca Nijo en Ecuador, usas emojis y hablas de tú").
                                  </p>
                                  <textarea
                                    className="w-full h-40 p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs leading-relaxed"
                                    placeholder="Escribe aquí las instrucciones de personalidad..."
                                    value={drafts[b.id]?.agentPersona || ''}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [b.id]: { ...prev[b.id], agentPersona: e.target.value },
                                      }))
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label className="block text-xs font-bold text-zinc-200 uppercase tracking-wider">
                                    ❓ Preguntas Frecuentes (`agent_faq`)
                                  </label>
                                  <p className="text-xs text-zinc-400">
                                    Información adicional (ej: "Q: ¿Aceptan mascotas? A: Sí, en terraza. Q: ¿Tienen parqueadero? A: Gratuito").
                                  </p>
                                  <textarea
                                    className="w-full h-40 p-3 bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs leading-relaxed"
                                    placeholder="Escribe aquí preguntas y respuestas frecuentes..."
                                    value={drafts[b.id]?.agentFaq || ''}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [b.id]: { ...prev[b.id], agentFaq: e.target.value },
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-3 pt-2">
                                <button
                                  onClick={() => save(b.id)}
                                  disabled={saving === b.id}
                                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-50"
                                >
                                  {saving === b.id ? '💾 Guardando cambios...' : '💾 Guardar Tono y FAQ'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
