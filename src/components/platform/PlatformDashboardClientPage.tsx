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
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Panel de plataforma</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th>Negocio</th>
            <th>Activo</th>
            <th>Salud del agente</th>
            <th>Pedidos (7d)</th>
            <th>Reservas (7d)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => {
            const h = health[b.id];
            return (
              <Fragment key={b.id}>
                <tr style={{ borderBottom: '1px solid #ccc' }}>
                  <td>{b.name}</td>
                  <td>{b.active ? '✅' : '❌'}</td>
                  <td>{h?.loading ? '...' : h?.ready === undefined ? '❓ salud desconocida' : h.ready ? '🟢 listo' : '🔴 con problemas'}</td>
                  <td>{b.ordersLast7d}</td>
                  <td>{b.reservationsLast7d}</td>
                  <td>
                    <button onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                      {expanded === b.id ? 'Cerrar' : 'Editar tono/FAQ'}
                    </button>
                  </td>
                </tr>
                {expanded === b.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 16, background: '#f5f5f5' }}>
                      {h?.checks && (
                        <ul>
                          {h.checks.map((c) => (
                            <li key={c.label} style={{ color: c.ok ? 'green' : c.required ? 'red' : 'orange' }}>
                              {c.ok ? '✅' : c.required ? '❌' : '⚠️'} {c.label}: {c.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      <label>Tono (agent_persona)</label>
                      <textarea
                        style={{ width: '100%', minHeight: 60 }}
                        value={drafts[b.id]?.agentPersona || ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], agentPersona: e.target.value } }))}
                      />
                      <label>FAQ (agent_faq)</label>
                      <textarea
                        style={{ width: '100%', minHeight: 100 }}
                        value={drafts[b.id]?.agentFaq || ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], agentFaq: e.target.value } }))}
                      />
                      <button onClick={() => save(b.id)} disabled={saving === b.id}>
                        {saving === b.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
