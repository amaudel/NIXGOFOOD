-- ============================================================================
-- NIXGOFOOD: relajar idempotencia del ledger de fidelizacion
--
-- El indice unico idx_loyalty_transactions_order_type (order_id, type) se
-- penso como candado anti-duplicados, pero es redundante: transition_order_status
-- y rollback_order_status ya usan un patron CAS (UPDATE ... WHERE status =
-- estado_esperado) ANTES de tocar el ledger -- un reintento de la misma
-- llamada encuentra el estado ya cambiado y corta con CONCURRENCY_CONFLICT
-- sin llegar nunca al bloque de fidelizacion. El candado real ya existe.
--
-- El efecto NO deseado de ese indice unico era bloquear un ciclo legitimo:
-- si un pedido se reabre (delivered -> on_the_way, revierte los puntos) y
-- se vuelve a entregar de verdad, la segunda acreditacion 'earn' chocaba
-- contra la primera fila y se perdia para siempre.
--
-- Se reemplaza por un indice NO unico (misma forma, sin la restriccion) para
-- mantener el rendimiento de las consultas por order_id/type.
--
-- Tambien se agrega 'redeem_reversal' al CHECK de type: nuevo tipo de
-- transaccion para devolver puntos canjeados cuando el negocio cancela un
-- pedido que ya habia usado el descuento de fidelizacion.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_loyalty_transactions_order_type;

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order_type
  ON public.loyalty_transactions(order_id, type, created_at DESC)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.loyalty_transactions
  DROP CONSTRAINT IF EXISTS loyalty_transactions_type_check;

ALTER TABLE public.loyalty_transactions
  ADD CONSTRAINT loyalty_transactions_type_check
  CHECK (type IN ('earn', 'redeem', 'earn_reversal', 'redeem_reversal'));
