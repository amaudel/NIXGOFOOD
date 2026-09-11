-- Agrega un campo de texto libre por negocio con preguntas frecuentes /
-- politicas generales (ej. "¿aceptan mascotas?", "¿hay parqueadero?",
-- "politica de cancelacion") que el agente de IA usa para contestar
-- preguntas generales del cliente, ademas del menu/pedidos/reservas que ya
-- maneja. Nulo/vacio = el agente no tiene informacion adicional que dar,
-- comportamiento identico al de hoy.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS agent_faq TEXT;

COMMENT ON COLUMN public.businesses.agent_faq IS
  'Preguntas frecuentes/políticas generales del negocio (texto libre, opcional) que el agente de IA usa para responder preguntas fuera del menú/pedidos/reservas.';
