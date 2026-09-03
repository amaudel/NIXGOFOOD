-- Endurece create_reservation: fija el search_path y califica sus tablas.
--
-- Era la unica de las once funciones del esquema que siendo SECURITY
-- DEFINER (corre con los privilegios de su dueno) no fijaba search_path.
-- Sin eso, quien pueda influir en el search_path de la sesion puede
-- hacer que la funcion resuelva `businesses`, `business_hours` o
-- `reservations` contra tablas que no son las suyas, aprovechando esos
-- privilegios elevados.
--
-- No es teorico que este expuesta: se verifico el 2026-09-03 que el rol
-- anon puede ejecutarla -- una llamada sin autenticar llega a la
-- validacion de negocio de la propia funcion, no a un error de permisos.
--
-- Con el search_path vacio solo se resuelve pg_catalog, asi que las tres
-- tablas pasan a public.*. El resto de las llamadas (TRIM, LENGTH,
-- EXTRACT, clock_timestamp, jsonb_build_object) son de pg_catalog y no
-- necesitan cambio. Es el mismo tratamiento que ya tenian las otras
-- funciones y el que se le aplico a create_order.
--
-- El contrato del RPC no cambia: mismo payload, misma respuesta. El bot
-- que la consume (AgenteRestaurante) no requiere ningun ajuste.
--
-- Cambios respecto de la version importada en 20260903000300:
--   + SET search_path TO ''
--   businesses      -> public.businesses
--   business_hours  -> public.business_hours
--   reservations    -> public.reservations

CREATE OR REPLACE FUNCTION public.create_reservation(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

  SELECT active INTO v_business_active FROM public.businesses WHERE id = v_business_id;
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
  FROM public.business_hours WHERE branch_id = v_branch_id AND day_of_week = v_day_of_week;

  IF v_open_time IS NULL OR v_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante está cerrado ese día.';
  END IF;
  IF v_reservation_time < v_open_time OR v_reservation_time > v_close_time THEN
    RAISE EXCEPTION 'Esa hora está fuera de nuestro horario de atención (% - %).', v_open_time, v_close_time;
  END IF;

  v_special_request := p_payload->>'specialRequest';

  INSERT INTO public.reservations (
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
