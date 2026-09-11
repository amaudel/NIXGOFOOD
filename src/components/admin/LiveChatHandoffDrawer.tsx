'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, UserCheck, PauseCircle, PlayCircle, Send, X, AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react';

export interface AgentHandoff {
  id: string;
  business_id: string;
  chat_id: string;
  channel: string;
  customer_name?: string;
  last_message?: string;
  status: 'pending' | 'in_progress' | 'resolved';
  paused_ai: boolean;
  created_at: string;
  updated_at: string;
}

interface LiveChatHandoffDrawerProps {
  onHandoffCountChange?: (count: number) => void;
}

export const LiveChatHandoffDrawer: React.FC<LiveChatHandoffDrawerProps> = ({ onHandoffCountChange }) => {
  const [handoffs, setHandoffs] = useState<AgentHandoff[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedHandoff, setSelectedHandoff] = useState<AgentHandoff | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');

  const handleCleanupHandoffs = async () => {
    if (cleaning) return;
    setCleaning(true);
    try {
      const res = await fetch('/api/admin/cron/cleanup-handoffs', { method: 'POST' });
      const data = await res.json();
      if (data.message) {
        fetchHandoffs();
      }
    } catch {
      // ignore
    } finally {
      setCleaning(false);
    }
  };

  const fetchHandoffs = async () => {
    try {
      const res = await fetch('/api/admin/handoffs');
      const data = await res.json();
      if (data.handoffs) {
        setHandoffs(data.handoffs);
        const pendingCount = data.handoffs.filter((h: AgentHandoff) => h.status === 'pending' || h.paused_ai).length;
        if (onHandoffCountChange) onHandoffCountChange(pendingCount);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchHandoffs();
    const interval = setInterval(fetchHandoffs, 10000);
    return () => clearInterval(interval);
  }, []);

  // Classify handoffs by active vs resolved
  const activeHandoffs = handoffs
    .filter((h) => h.status === 'pending' || h.status === 'in_progress' || h.paused_ai)
    .sort((a, b) => {
      // Priority: pending (0) > in_progress (1) > resolved (2)
      const priority = { pending: 0, in_progress: 1, resolved: 2 };
      const prioDiff = (priority[a.status] ?? 2) - (priority[b.status] ?? 2);
      if (prioDiff !== 0) return prioDiff;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  const resolvedHandoffs = handoffs
    .filter((h) => h.status === 'resolved' && !h.paused_ai)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const displayedHandoffs = activeTab === 'active' ? activeHandoffs : resolvedHandoffs;

  const handleReply = async (handoff: AgentHandoff) => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/admin/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoffId: handoff.id,
          action: 'reply',
          replyText: replyText.trim(),
        }),
      });
      setReplyText('');
      fetchHandoffs();
    } finally {
      setSending(false);
    }
  };

  const handleToggleAi = async (handoff: AgentHandoff, pause: boolean) => {
    try {
      await fetch('/api/admin/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoffId: handoff.id,
          action: 'toggle_ai',
          pausedAi: pause,
        }),
      });
      fetchHandoffs();
    } catch {
      // ignore
    }
  };

  const handleResolve = async (handoff: AgentHandoff) => {
    try {
      await fetch('/api/admin/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoffId: handoff.id,
          action: 'resolve',
        }),
      });
      if (selectedHandoff?.id === handoff.id) setSelectedHandoff(null);
      fetchHandoffs();
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Banner de alerta parpadeante cuando hay solicitudes activas */}
      {activeHandoffs.length > 0 && (
        <div className="mb-4 bg-amber-950/90 border border-amber-800 text-amber-200 p-3 rounded-2xl flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-900/80 rounded-xl text-amber-300">
              <AlertCircle className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">
                🔴 {activeHandoffs.length} {activeHandoffs.length === 1 ? 'Cliente requiere' : 'Clientes requieren'} atención humana
              </h4>
              <p className="text-xs text-amber-300/90">
                {activeHandoffs[0].customer_name || 'Cliente'}: "{activeHandoffs[0].last_message || 'Solicitó un agente humano'}"
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setActiveTab('active');
              setSelectedHandoff(activeHandoffs[0]);
              setOpen(true);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
          >
            💬 Atender Chat ({activeHandoffs.length})
          </button>
        </div>
      )}

      {/* Botón flotante opcional si no hay banner */}
      {activeHandoffs.length === 0 && (
        <button
          onClick={() => {
            setActiveTab('active');
            setOpen(true);
          }}
          className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl border border-zinc-800 transition-all"
        >
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          Atención en Vivo ({activeHandoffs.length})
        </button>
      )}

      {/* Drawer Modal de Atención en Vivo */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
            {/* Header Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-base text-white">Atención al Cliente en Vivo</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Tabs: Activos vs Resueltos */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 pt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all ${
                    activeTab === 'active'
                      ? 'border-orange-500 text-orange-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  🔴 Pendientes / Activos ({activeHandoffs.length})
                </button>
                <button
                  onClick={() => setActiveTab('resolved')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all ${
                    activeTab === 'resolved'
                      ? 'border-orange-500 text-orange-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ✅ Resueltos ({resolvedHandoffs.length})
                </button>
              </div>

              {activeTab === 'resolved' && resolvedHandoffs.length > 0 && (
                <button
                  onClick={handleCleanupHandoffs}
                  disabled={cleaning}
                  className="mb-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Eliminar chats resueltos con más de 14 días de antigüedad"
                >
                  <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                  {cleaning ? 'Limpiando...' : 'Depurar (+14 días)'}
                </button>
              )}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {displayedHandoffs.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  {activeTab === 'active'
                    ? '🎉 No hay solicitudes pendientes de atención humana en este momento.'
                    : 'No hay chats resueltos en el historial.'}
                </div>
              ) : (
                displayedHandoffs.map((h) => {
                  const isSelected = selectedHandoff?.id === h.id;
                  const isPending = h.status === 'pending';

                  return (
                    <div
                      key={h.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isPending
                          ? 'bg-amber-950/40 border-amber-800/80 shadow-md animate-pulse'
                          : h.paused_ai
                          ? 'bg-amber-950/20 border-amber-900/50'
                          : 'bg-zinc-900/40 border-zinc-800 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <UserCheck className={`w-4 h-4 ${isPending ? 'text-amber-300' : 'text-zinc-400'}`} />
                          <span className="font-bold text-sm text-white">
                            {h.customer_name || `Cliente (${h.chat_id.slice(-4)})`}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                            {h.channel}
                          </span>
                        </div>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                            isPending
                              ? 'bg-red-950 text-red-300 border-red-800 animate-bounce'
                              : h.paused_ai
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {isPending
                            ? '🔴 REQUIERE ATENCIÓN'
                            : h.paused_ai
                            ? '⏸️ IA Pausada (Atendiendo)'
                            : '✅ Resuelto (IA Activa)'}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-200 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800 mb-3 font-medium">
                        "{h.last_message || 'Solicitó atención humana'}"
                      </p>

                      {/* Botones de acción */}
                      <div className="flex items-center gap-2 pt-1">
                        {h.paused_ai ? (
                          <button
                            onClick={() => handleToggleAi(h, false)}
                            className="flex-1 py-1.5 px-3 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                          >
                            <PlayCircle className="w-3.5 h-3.5" /> Reanudar IA
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleAi(h, true)}
                            className="flex-1 py-1.5 px-3 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                          >
                            <PauseCircle className="w-3.5 h-3.5" /> Pausar IA
                          </button>
                        )}
                        {h.status !== 'resolved' && (
                          <button
                            onClick={() => handleResolve(h)}
                            className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-xl transition-all"
                          >
                            ✅ Resuelto
                          </button>
                        )}
                      </div>

                      {/* Formulario de Respuesta Rápida */}
                      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Escribe tu respuesta al cliente..."
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                          value={isSelected ? replyText : ''}
                          onFocus={() => setSelectedHandoff(h)}
                          onChange={(e) => {
                            setSelectedHandoff(h);
                            setReplyText(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleReply(h);
                          }}
                        />
                        <button
                          onClick={() => handleReply(h)}
                          disabled={sending}
                          className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all active:scale-95 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

