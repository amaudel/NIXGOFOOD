-- Agrega un campo de texto libre por negocio para que el agente de IA
-- (AgenteRestaurante) hable con un tono/personalidad distinto por
-- restaurante (ej. modismos mexicanos en una taqueria, criollo ecuatoriano
-- en otro). Nulo/vacio = tono neutro por defecto, asi ningun negocio
-- existente cambia de comportamiento hasta que alguien lo configure.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS agent_persona TEXT;

COMMENT ON COLUMN public.businesses.agent_persona IS
  'Instrucción de tono/personalidad para el agente de IA de este negocio (opcional). Si es NULL, el agente usa un tono neutro por defecto.';
