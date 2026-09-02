'use client';

import { useEffect, useRef, useState } from 'react';

type OutgoingMessage =
  | { type: 'text'; text: string }
  | { type: 'photo'; url: string; caption: string }
  | { type: 'buttons'; text: string; buttons: { text: string; data: string }[] }
  | { type: 'request_location'; text: string };

interface ChatEntry {
  from: 'user' | 'bot';
  message: OutgoingMessage;
}

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';
const SESSION_STORAGE_KEY = 'nixgofood_chat_session_id';

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, fresh);
  return fresh;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, loading]);

  async function send(payload: { text?: string; callbackData?: string }) {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { messages: OutgoingMessage[] };
      setEntries((prev) => [...prev, ...data.messages.map((message) => ({ from: 'bot' as const, message }))]);
    } catch (err) {
      setError('No se pudo enviar, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setEntries((prev) => [...prev, { from: 'user', message: { type: 'text', text } }]);
    setInput('');
    send({ text });
  }

  function handleButtonClick(data: string, label: string) {
    setEntries((prev) => [...prev, { from: 'user', message: { type: 'text', text: label } }]);
    send({ callbackData: data });
  }

  if (!AGENT_URL) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="flex items-center justify-between rounded-t-xl bg-zinc-800 px-4 py-3">
            <span className="font-semibold text-zinc-100">🌮 Asistente El Taca Nijo</span>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-100" aria-label="Cerrar chat">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {entries.length === 0 && (
              <p className="text-sm text-zinc-400">¡Hola! Pregúntame por el menú o pide directo aquí 🌮</p>
            )}
            {entries.map((entry, i) => (
              <ChatBubble key={i} entry={entry} onButtonClick={handleButtonClick} />
            ))}
            {loading && <p className="text-xs text-zinc-500">Escribiendo...</p>}
          </div>

          {error && <p className="px-4 pb-1 text-xs text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-800 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      <div className="flex items-center gap-2">
        <a
          href="https://t.me/ELTACANIJOPEDIDOSBOT"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#26A5E4] text-2xl text-white shadow-lg hover:bg-[#1e8fc7]"
          aria-label="Pedir por Telegram"
          title="Pedir por Telegram"
        >
          ✈️
        </a>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-2xl shadow-lg hover:bg-rose-500"
          aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
        >
          {open ? '✕' : '🌮'}
        </button>
      </div>
    </div>
  );
}

function ChatBubble({
  entry,
  onButtonClick,
}: {
  entry: ChatEntry;
  onButtonClick: (data: string, label: string) => void;
}) {
  const align = entry.from === 'user' ? 'ml-auto bg-rose-600 text-white' : 'mr-auto bg-zinc-800 text-zinc-100';
  const msg = entry.message;

  if (msg.type === 'photo') {
    return (
      <div className={`max-w-[85%] rounded-lg ${align} overflow-hidden`}>
        <img src={msg.url} alt={msg.caption} className="h-32 w-full object-cover" />
        <p className="whitespace-pre-wrap p-2 text-sm">{msg.caption}</p>
      </div>
    );
  }

  if (msg.type === 'buttons') {
    return (
      <div className={`max-w-[85%] rounded-lg p-3 text-sm ${align}`}>
        <p className="whitespace-pre-wrap">{msg.text}</p>
        <div className="mt-2 flex gap-2">
          {msg.buttons.map((b) => (
            <button
              key={b.data}
              onClick={() => onButtonClick(b.data, b.text)}
              className="rounded-md bg-zinc-950/40 px-2 py-1 text-xs font-medium hover:bg-zinc-950/60"
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 'text' and the defensive 'request_location' fallback both render as plain text.
  return (
    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm ${align}`}>{msg.text}</div>
  );
}
