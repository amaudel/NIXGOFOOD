-- Trae al repositorio cuatro funciones que existian SOLO en la base.
--
-- Se descubrieron el 2026-09-03 comparando las definiciones de la base
-- contra las del repo (ver supabase/scripts/comparar_deriva_funciones.sql),
-- despues de que reaplicar create_order revirtiera un arreglo que tampoco
-- estaba versionado y dejara sin poder crear pedidos.
--
-- De donde salio cada una:
--
--   create_reservation              Funcion de reservas de mesa. La consume
--                                   AgenteRestaurante (el bot de chat, otro
--                                   repositorio); el SQL se corrio a mano
--                                   contra produccion. NO esta en desuso.
--   current_user_can_dispatch       Usada por las politicas RLS de
--   set_dispatch_check_audit_fields order_dispatch_checks (la segunda ademas
--                                   por el trigger trg_set_dispatch_check_audit).
--                                   Vivian solo en supabase/legacy_migrations/,
--                                   que no forma parte de las migraciones activas.
--   safe_cast_uuid                  Sin consumidor conocido en este repo.
--
-- Los cuerpos se reproducen tal como estan hoy en la base, sin retocarlos,
-- para que una comparacion futura no de diferencias falsas. Aplicar esta
-- migracion sobre la base actual no cambia nada; su valor esta en que
-- rearmar la base desde las migraciones deje de perder estos objetos --
-- sin current_user_can_dispatch, las politicas de order_dispatch_checks
-- quedan referenciando una funcion inexistente.
--
-- PENDIENTE DE SEGURIDAD (ver notas al pie): create_reservation es
-- SECURITY DEFINER y NO fija search_path, a diferencia de todas las demas.

-- ---------------------------------------------------------------------
-- create_reservation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_reservation(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_business_id UUID; v_branch_id UUID; v_business_active BOOLEAN;
  v_customer_name TEXT; v_customer_phone TEXT;
  v_party_size INT; v_reservation_date DATE; v_reservation_time TIME;
  v_special_request TEXT;
  v_day_of_week INT; v_open_time TIME; v_close_time TIME; v_closed BOOLEAN;
  v_reservation_id UUID; v_created_at TIMESTAMPTZ;
BEGIN
  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

  SELECT active INTO v_business_active FROM businesses WHERE id = v_business_id;
  IF v_business_active IS NOT TRUE THEN RAISE EXCEPTION 'El negocio no existe o no se encuentra activo.'; END IF;

  v_customer_name := TRIM(p_payload->'customer'->>'name');
  v_customer_phone := TRIM(p_payload->'customer'->>'phone');
  IF LENGTH(v_customer_name) = 0 OR LENGTH(v_customer_phone) < 7 THEN
    RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos.';
  END IF;

  v_party_size := (p_payload->>'partySize')::INT;
  IF v_party_size IS NULL OR v_party_size <= 0 THEN
    RAISE EXCEPTION 'El número de personas debe ser mayor a 0.';
  END IF;

  v_reservation_date := (p_payload->>'date')::DATE;
  v_reservation_time := (p_payload->>'time')::TIME;
  IF v_reservation_date IS NULL OR v_reservation_time IS NULL THEN
    RAISE EXCEPTION 'Fecha u hora inválida.';
  END IF;
  IF (v_reservation_date + v_reservation_time) < clock_timestamp() THEN
    RAISE EXCEPTION 'No se puede reservar en una fecha u hora que ya pasó.';
  END IF;

  v_day_of_week := EXTRACT(DOW FROM v_reservation_date);
  SELECT open_time, close_time, closed INTO v_open_time, v_close_time, v_closed
  FROM business_hours WHERE branch_id = v_branch_id AND day_of_week = v_day_of_week;

  IF v_open_time IS NULL OR v_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante está cerrado ese día.';
  END IF;
  IF v_reservation_time < v_open_time OR v_reservation_time > v_close_time THEN
    RAISE EXCEPTION 'Esa hora está fuera de nuestro horario de atención (% - %).', v_open_time, v_close_time;
  END IF;

  v_special_request := p_payload->>'specialRequest';

  INSERT INTO reservations (
    business_id, branch_id, customer_name, customer_phone, party_size,
    reservation_date, reservation_time, special_request, status
  ) VALUES (
    v_business_id, v_branch_id, v_customer_name, v_customer_phone, v_party_size,
    v_reservation_date, v_reservation_time, v_special_request, 'confirmed'
  ) RETURNING id, created_at INTO v_reservation_id, v_created_at;

  RETURN jsonb_build_object(
    'id', v_reservation_id,
    'partySize', v_party_size,
    'date', v_reservation_date,
    'time', v_reservation_time,
    'createdAt', v_created_at
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- current_user_can_dispatch
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_can_dispatch()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.active = true
      AND p.role IN ('owner', 'admin', 'operator')
      AND p.business_id IS NOT NULL
  );
$function$;

-- ---------------------------------------------------------------------
-- safe_cast_uuid
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_cast_uuid(p_val text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  DECLARE
    v_hash TEXT;
  BEGIN
    IF p_val IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN p_val::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_hash := md5(p_val);
    RETURN (
      substr(v_hash, 1, 8) || '-' ||
      substr(v_hash, 9, 4) || '-' ||
      substr(v_hash, 13, 4) || '-' ||
      substr(v_hash, 17, 4) || '-' ||
      substr(v_hash, 21, 12)
    )::UUID;
  END;
  $function$;

-- ---------------------------------------------------------------------
-- set_dispatch_check_audit_fields
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_dispatch_check_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
      RAISE EXCEPTION 'business_id is immutable';
    END IF;

    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'order_id is immutable';
    END IF;
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- Nota de seguridad, para decidir aparte
-- ---------------------------------------------------------------------
-- create_reservation es SECURITY DEFINER (corre con los privilegios de su
-- dueno) y no declara SET search_path, mientras que las otras siete
-- funciones del esquema si lo hacen. Ademas referencia businesses,
-- business_hours y reservations sin calificar el esquema.
--
-- Se comprobo que el rol anon puede ejecutarla: una llamada sin
-- autenticar llega a su propia validacion ("El negocio no existe...") y no
-- a un error de permisos.
--
-- No se corrige aca a proposito: la funcion pertenece a otro proyecto
-- (AgenteRestaurante) y endurecerla requiere coordinar con quien lo
-- mantiene. El arreglo seria agregar SET search_path = '' y calificar las
-- tres tablas como public.*, igual que se hizo con create_order.
