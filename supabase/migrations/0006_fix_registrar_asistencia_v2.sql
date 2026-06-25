-- ============================================================================
-- Migración: registrar_asistencia v2 — eliminar TODA ambigüedad de columnas
--
-- Causa: RETURNS TABLE (id, fecha, hora_registro, estado, metodo_deteccion)
-- declara esos nombres como variables PL/pgSQL. Cualquier referencia sin
-- calificar a esos nombres en el cuerpo choca con la variable (error 42702).
-- El punto que no se puede calificar con alias es el conflict target de
-- ON CONFLICT (horario_id, fecha): ahí `fecha` colisionaba con el OUT param.
--
-- Solución (doble blindaje):
--   1) `#variable_conflict use_column`: ante una ambigüedad, PL/pgSQL elige la
--      COLUMNA en vez de la variable. Resuelve el ON CONFLICT. Es seguro porque
--      nuestras variables propias usan prefijos v_/p_ (no colisionan) y los OUT
--      params se llenan por posición con RETURN QUERY (nunca se leen por nombre).
--   2) Alias de tabla en cada columna referenciada en expresiones.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.registrar_asistencia(
  p_profesor_id uuid,
  p_horario_id uuid,
  p_aula_id uuid,
  p_metodo text,
  p_beacon text,
  p_lat float8,
  p_lon float8
)
returns table (
  id uuid,
  fecha date,
  hora_registro timestamptz,
  estado text,
  metodo_deteccion text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_inicio time;
  v_estado text;
  v_id     uuid;
begin
  -- Hora de inicio de la clase. `h.hora_inicio` y `h.id` calificados;
  -- p_horario_id es parámetro (prefijo p_, sin colisión).
  select h.hora_inicio
    into v_inicio
    from public.horarios h
   where h.id = p_horario_id;

  -- Estado server-side: 10 min de tolerancia tras el inicio = presente.
  if v_inicio is null
     or (now() at time zone 'America/Mexico_City')::time <= v_inicio + interval '10 minutes'
  then
    v_estado := 'presente';
  else
    v_estado := 'tarde';
  end if;

  -- INSERT con alias `ra`. Los nombres en la lista de columnas y en el
  -- conflict target son columnas por sintaxis; `#variable_conflict use_column`
  -- garantiza que `fecha` en ON CONFLICT se resuelva a la columna.
  insert into public.registros_asistencia as ra
        (horario_id, profesor_id, aula_id, fecha, metodo_deteccion,
         beacon_detectado, estado, latitud, longitud)
  values (p_horario_id, p_profesor_id, p_aula_id, current_date, p_metodo,
         p_beacon, v_estado, p_lat, p_lon)
  on conflict (horario_id, fecha) do nothing
  returning ra.id
       into v_id;

  -- Si ya existía (doble registro), recuperar el id existente sin modificarlo.
  if v_id is null then
    select ra.id
      into v_id
      from public.registros_asistencia ra
     where ra.horario_id = p_horario_id
       and ra.fecha = current_date;
  end if;

  -- Devolver el registro (todas las columnas calificadas con el alias `ra`).
  return query
    select ra.id, ra.fecha, ra.hora_registro, ra.estado, ra.metodo_deteccion
      from public.registros_asistencia ra
     where ra.id = v_id;
end;
$$;

grant execute on function public.registrar_asistencia(uuid, uuid, uuid, text, text, float8, float8)
  to anon, authenticated;
