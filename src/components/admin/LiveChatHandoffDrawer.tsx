'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, UserCheck, PauseCircle, PlayCircle, Send, X, AlertCircle } from 'lucide-react';

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

  const pendingHandoffs = handoffs.filter((h) => h.status === 'pending' || h.paused_ai);

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
      {pendingHandoffs.length > 0 && (
        <div className="mb-4 bg-amber-950/90 border border-amber-800 text-amber-200 p-3 rounded-2xl flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-900/80 rounded-xl text-amber-300">
              <AlertCircle className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">
                🔴 {pendingHandoffs.length} {pendingHandoffs.length === 1 ? 'Cliente requiere' : 'Clientes requieren'} atención humana
              </h4>
              <p className="text-xs text-amber-300/90">
                {pendingHandoffs[0].customer_name || 'Cliente'}: "{pendingHandoffs[0].last_message || 'Solicitó un agente humano'}"
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setSelectedHandoff(pendingHandoffs[0]);
              setOpen(true);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
          >
            💬 Atender Chat
          </button>
        </div>
      )}

      {/* Botón flotante opcional si no hay banner */}
      {pendingHandoffs.length === 0 && (
        <button
          onClick={() => setOpen(true)}
          className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl border border-zinc-800 transition-all"
        >
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          Atención en Vivo ({handoffs.length})
        </button>
      )}

      {/* Drawer Modal de Atención en Vivo */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-base text-white">Atención al Cliente en Vivo</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {handoffs.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  No hay solicitudes de atención humana por ahora.
                </div>
              ) : (
                handoffs.map((h) => {
                  const isSelected = selectedHandoff?.id === h.id;
                  return (
                    <div
                      key={h.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        h.paused_ai
                          ? 'bg-amber-950/30 border-amber-900/60'
                          : 'bg-zinc-900/60 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-sm text-white">
                            {h.customer_name || `Cliente (${h.chat_id.slice(-4)})`}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                            {h.channel}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            h.paused_ai
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          }`}
                        >
                          {h.paused_ai ? '⏸️ IA Pausada' : '▶️ IA Activa'}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80 mb-3">
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
                        <button
                          onClick={() => handleResolve(h)}
                          className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-xl transition-all"
                        >
                          ✅ Resuelto
                        </button>
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
