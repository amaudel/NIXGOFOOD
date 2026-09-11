-- profiles.business_id resulta ser NOT NULL en la base real (el archivo de
-- baseline en el repo lo tenía como nullable - deriva de esquema, no la
-- primera vez que pasa en este proyecto). Un perfil de plataforma
-- (is_platform_admin = true) es independiente de cualquier restaurante
-- específico por diseño - no debe quedar atado a uno solo solo para
-- satisfacer esta columna. Se relaja la restricción para reflejar eso.
ALTER TABLE public.profiles ALTER COLUMN business_id DROP NOT NULL;
