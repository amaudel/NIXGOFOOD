'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface UnreviewedOrder {
  id: string;
  orderNumber: string;
  deliveryMethod?: string;
  total?: number;
  customerName?: string;
  receivedAt: string;
}

interface NewOrderAlertContextType {
  unreviewedOrders: UnreviewedOrder[];
  unreviewedOrderIds: string[];
  isAudioMuted: boolean;
  isAudioUnlocked: boolean;
  hasShakeActive: boolean;
  triggerNewOrderAlert: (rawOrder: any) => void;
  acknowledgeOrder: (orderId: string) => void;
  toggleAudioMute: () => void;
  unlockAudioContext: () => void;
  playTestChime: () => void;
}

const NewOrderAlertContext = createContext<NewOrderAlertContextType | null>(null);

const STORAGE_KEY_UNREVIEWED = 'kds_unreviewed_orders';
const STORAGE_KEY_MUTE = 'kds_audio_muted';

/**
 * HTML5 Audio Fallback Synthesizer for Mobile Safari / Chrome Mobile
 * Generates an in-memory PCM WAV audio chime Blob to bypass mobile Web Audio restrictions
 */
function playMobilePcmChime() {
  if (typeof window === 'undefined') return;
  try {
    const sampleRate = 22050;
    const duration = 0.45;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Uint8Array(44 + numSamples);

    // RIFF Header
    buffer.set([82, 73, 70, 70], 0); // "RIFF"
    const fileLength = 36 + numSamples;
    buffer[4] = fileLength & 0xff;
    buffer[5] = (fileLength >> 8) & 0xff;
    buffer[6] = (fileLength >> 16) & 0xff;
    buffer[7] = (fileLength >> 24) & 0xff;
    buffer.set([87, 65, 86, 69], 8); // "WAVE"

    // fmt Chunk
    buffer.set([102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0], 12);
    buffer[24] = sampleRate & 0xff;
    buffer[25] = (sampleRate >> 8) & 0xff;
    buffer[26] = (sampleRate >> 16) & 0xff;
    buffer[27] = (sampleRate >> 24) & 0xff;
    buffer[28] = sampleRate & 0xff;
    buffer[29] = (sampleRate >> 8) & 0xff;
    buffer[30] = (sampleRate >> 16) & 0xff;
    buffer[31] = (sampleRate >> 24) & 0xff;
    buffer[32] = 1;
    buffer[33] = 0;
    buffer[34] = 8;
    buffer[35] = 0;

    // data Chunk
    buffer.set([100, 97, 116, 97], 36);
    buffer[40] = numSamples & 0xff;
    buffer[41] = (numSamples >> 8) & 0xff;
    buffer[42] = (numSamples >> 16) & 0xff;
    buffer[43] = (numSamples >> 24) & 0xff;

    // Dual Chime Tones (A5: 880Hz then C6: 1046.5Hz)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = t < 0.2 ? 880 : 1046.5;
      const volume = Math.max(0, 1 - t / duration);
      const sample = Math.sin(2 * Math.PI * freq * t);
      buffer[44 + i] = Math.floor(128 + sample * 115 * volume);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play().then(() => {
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Web Audio API Dual-Tone Chime Synthesizer: "DING-DING — NUEVA COMANDA"
 * Tone 1: A5 (880 Hz) -> Tone 2: C6 (1046.5 Hz)
 */
function playKitchenChime(audioCtx: AudioContext, isReminder: boolean = false) {
  playMobilePcmChime();

  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;

    if (isReminder) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
      return;
    }

    // Tone 1: A5 (880 Hz) - "DING"
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);

    // Tone 2: C6 (1046.5 Hz) - "DING" (after 220ms)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.22);
    gain2.gain.setValueAtTime(0, now + 0.22);
    gain2.gain.linearRampToValueAtTime(0.6, now + 0.24);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.22);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.warn('Kitchen chime playback failed:', err);
  }
}

export const NewOrderAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreviewedOrders, setUnreviewedOrders] = useState<UnreviewedOrder[]>([]);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const [hasShakeActive, setHasShakeActive] = useState<boolean>(false);

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Deduplication Set to track all seen order IDs in this session
  const seenOrdersRef = useRef<Set<string>>(new Set());

  // Initial LocalStorage Restoration for Persistence Across Refresh
  useEffect(() => {
    try {
      const savedMute = localStorage.getItem(STORAGE_KEY_MUTE);
      if (savedMute !== null) {
        setIsAudioMuted(savedMute === 'true');
      }

      const savedUnreviewed = localStorage.getItem(STORAGE_KEY_UNREVIEWED);
      if (savedUnreviewed) {
        const parsed: UnreviewedOrder[] = JSON.parse(savedUnreviewed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUnreviewedOrders(parsed);
          parsed.forEach((item) => {
            if (item.id) seenOrdersRef.current.add(item.id);
          });
        }
      }
    } catch (e) {
      console.warn('Failed to restore KDS alert state from localStorage:', e);
    }
  }, []);

  // Sync unreviewedOrders state with localStorage
  const saveUnreviewedState = (ordersList: UnreviewedOrder[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_UNREVIEWED, JSON.stringify(ordersList));
    } catch (e) {}
  };

  // Helper to get or create AudioContext and monitor state
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();

        audioCtxRef.current.onstatechange = () => {
          if (audioCtxRef.current?.state === 'running') {
            setIsAudioUnlocked(true);
          } else if (audioCtxRef.current?.state === 'suspended') {
            setIsAudioUnlocked(false);
          }
        };
      }
    }

    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'running') {
        setIsAudioUnlocked(true);
      } else {
        setIsAudioUnlocked(false);
      }
    }

    return audioCtxRef.current;
  }, []);

  // Consultar el estado real del audio al montar.
  //
  // Sin esto isAudioUnlocked se quedaba en false hasta el primer clic, asi
  // que al recargar el panel las alertas aparecian como desactivadas
  // AUNQUE el navegador permitiera sonar -- que es el caso habitual en la
  // pantalla de cocina, que se usa todo el dia y ya tiene el permiso
  // concedido. getAudioContext lee el estado y ajusta la bandera; si el
  // navegador efectivamente bloquea, queda suspendido y se sigue pidiendo
  // el clic, que es lo honesto.
  useEffect(() => {
    getAudioContext();
  }, [getAudioContext]);

  // Automatic user gesture listener to unlock AudioContext on first tap/click
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUserInteraction = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            if (ctx.state === 'running') {
              setIsAudioUnlocked(true);
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('click', handleUserInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', handleUserInteraction, { capture: true, passive: true });

    return () => {
      window.removeEventListener('click', handleUserInteraction, { capture: true });
      window.removeEventListener('touchstart', handleUserInteraction, { capture: true });
      window.removeEventListener('keydown', handleUserInteraction, { capture: true });
    };
  }, [getAudioContext]);

  const unlockAudioContext = useCallback(() => {
    playMobilePcmChime();
    const ctx = getAudioContext();
    if (ctx) {
      ctx
        .resume()
        .then(() => {
          setIsAudioUnlocked(ctx.state === 'running');
          playKitchenChime(ctx, false);
        })
        .catch(() => {});
    }
  }, [getAudioContext]);

  const toggleAudioMute = useCallback(() => {
    setIsAudioMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_MUTE, String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const playTestChime = useCallback(() => {
    playMobilePcmChime();
    const ctx = getAudioContext();
    if (ctx && !isAudioMuted) {
      if (ctx.state === 'running') {
        playKitchenChime(ctx, false);
      } else {
        ctx
          .resume()
          .then(() => {
            if (ctx.state === 'running') {
              setIsAudioUnlocked(true);
              playKitchenChime(ctx, false);
            }
          })
          .catch(() => {});
      }
    }
  }, [getAudioContext, isAudioMuted]);

  const triggerNewOrderAlert = useCallback(
    (rawOrder: any) => {
      if (!rawOrder) return;

      const orderId = typeof rawOrder === 'string' ? rawOrder : rawOrder?.id;
      if (!orderId) return;

      const orderObj = typeof rawOrder === 'object' && rawOrder !== null ? rawOrder : { id: orderId };

      const formattedOrderNumber =
        orderObj.orderNumber ||
        (orderObj.order_number
          ? typeof orderObj.order_number === 'number'
            ? `#${orderObj.order_number}`
            : String(orderObj.order_number).startsWith('#')
            ? String(orderObj.order_number)
            : `#${orderObj.order_number}`
          : '#---');

      const delMethod = orderObj.deliveryMethod || orderObj.delivery_method || 'delivery';
      const custName =
        orderObj.customer?.name || orderObj.customer_name || 'Cliente';
      const orderTotal = orderObj.total || 0;

      const newUnreviewedItem: UnreviewedOrder = {
        id: orderId,
        orderNumber: formattedOrderNumber,
        deliveryMethod: delMethod,
        total: orderTotal,
        customerName: custName,
        receivedAt: new Date().toISOString(),
      };

      setUnreviewedOrders((prev) => {
        const nextList = [newUnreviewedItem, ...prev.filter((o) => o.id !== orderId)];
        saveUnreviewedState(nextList);
        return nextList;
      });

      // Visual Shake Effect
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        setHasShakeActive(true);
        setTimeout(() => setHasShakeActive(false), 650);
      }

      // Physical Haptic Vibration (Unconditional for Mobile)
      if (
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        'vibrate' in navigator &&
        typeof navigator.vibrate === 'function'
      ) {
        try {
          navigator.vibrate([400, 200, 400, 200, 600]);
        } catch (e) {}
      }

      // Unconditional Audio Fallback Trigger
      if (!isAudioMuted) {
        playMobilePcmChime();
        const ctx = getAudioContext();
        if (ctx) {
          if (ctx.state === 'running') {
            playKitchenChime(ctx, false);
          } else {
            ctx
              .resume()
              .then(() => {
                if (ctx.state === 'running') {
                  setIsAudioUnlocked(true);
                  playKitchenChime(ctx, false);
                }
              })
              .catch(() => {});
          }
        }
      }
    },
    [getAudioContext, isAudioMuted]
  );

  // Individual Order Acknowledge (Removes strictly the specified order ID)
  const acknowledgeOrder = useCallback((orderId: string) => {
    setUnreviewedOrders((prev) => {
      const nextList = prev.filter((o) => o.id !== orderId);
      saveUnreviewedState(nextList);
      return nextList;
    });
  }, []);

  // 15-Second Audio Reminder Interval for unreviewed orders
  useEffect(() => {
    if (unreviewedOrders.length === 0 || isAudioMuted) return;

    const reminderInterval = setInterval(() => {
      playMobilePcmChime();
      const ctx = getAudioContext();
      if (ctx && isAudioUnlocked && ctx.state === 'running') {
        playKitchenChime(ctx, true);
      }
    }, 15000);

    return () => clearInterval(reminderInterval);
  }, [unreviewedOrders.length, isAudioMuted, isAudioUnlocked, getAudioContext]);

  // Document Title update when tab is in background
  useEffect(() => {
    const originalTitle = 'El Taca Nijo - Panel Restaurante';

    if (unreviewedOrders.length > 0 && typeof document !== 'undefined') {
      document.title = `(${unreviewedOrders.length}) 🔴 ¡NUEVO PEDIDO RECIBIDO! · ${originalTitle}`;
    } else if (typeof document !== 'undefined') {
      document.title = originalTitle;
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.title = originalTitle;
      }
    };
  }, [unreviewedOrders.length]);

  const unreviewedOrderIds = unreviewedOrders.map((o) => o.id);

  return (
    <NewOrderAlertContext.Provider
      value={{
        unreviewedOrders,
        unreviewedOrderIds,
        isAudioMuted,
        isAudioUnlocked,
        hasShakeActive,
        triggerNewOrderAlert,
        acknowledgeOrder,
        toggleAudioMute,
        unlockAudioContext,
        playTestChime,
      }}
    >
      {children}
    </NewOrderAlertContext.Provider>
  );
};

export const useNewOrderAlerts = () => {
  const context = useContext(NewOrderAlertContext);
  if (!context) {
    return {
      unreviewedOrders: [],
      unreviewedOrderIds: [],
      isAudioMuted: false,
      isAudioUnlocked: false,
      hasShakeActive: false,
      triggerNewOrderAlert: () => {},
      acknowledgeOrder: () => {},
      toggleAudioMute: () => {},
      unlockAudioContext: () => {},
      playTestChime: () => {},
    };
  }
  return context;
};
