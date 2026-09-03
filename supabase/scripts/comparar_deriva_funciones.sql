-- Detecta "deriva": funciones cuya definicion en la base ya no coincide
-- con la del repositorio, porque se editaron directamente en el panel y
-- ese cambio nunca se commiteo.
--
-- Paso a paso el 2026-09-03 nos costo caro: create_order tenia en la base
-- un arreglo (gen_random_bytes calificado) que no estaba en git, y
-- reaplicar la version del repo lo revirtio, dejando sin poder crear
-- ningun pedido.
--
-- Se compara el CUERPO de la funcion (prosrc), que Postgres guarda
-- literal, y no la definicion completa: la cabecera que devuelve
-- pg_get_functiondef esta normalizada y no serviria para comparar.
--
-- Correr en el SQL Editor y pasarle el resultado a quien tenga el repo.

SELECT
  p.proname                         AS funcion,
  md5(p.prosrc)                     AS md5_en_la_base,
  length(p.prosrc)                  AS largo,
  -- Estas dos columnas ayudan a ubicar la diferencia cuando el md5 no coincide.
  left(p.prosrc, 60)                AS empieza_con,
  right(p.prosrc, 60)               AS termina_con
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;
