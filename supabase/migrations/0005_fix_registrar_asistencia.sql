-- ============================================================================
-- Migración: corregir registrar_asistencia (error 42702 "column id is ambiguous")
--
-- La función declara RETURNS TABLE (id, fecha, ...), por lo que esos nombres se
-- vuelven variables PL/pgSQL. Las referencias de columna SIN calificar dentro
-- del cuerpo (p. ej. `where id = p_horario_id`) chocaban con esas variables y
-- Postgres abortaba con 42702 antes de insertar.
--
-- Solución: calificar todas las columnas con alias de tabla.
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
declare
  v_inicio time;
  v_estado text;
  v_id uuid;
begin
  -- `h.id` calificado: evita la ambigüedad con la variable de salida `id`
  select h.hora_inicio into v_inicio
  from public.horarios h
  where h.id = p_horario_id;

  -- Tolerancia de 10 min tras el inicio = "presente"; después = "tarde"
  if v_inicio is null
     or (now() at time zone 'America/Mexico_City')::time <= v_inicio + interval '10 minutes'
  then
    v_estado := 'presente';
  else
    v_estado := 'tarde';
  end if;

  insert into public.registros_asistencia
    (horario_id, profesor_id, aula_id, fecha, metodo_deteccion,
     beacon_detectado, estado, latitud, longitud)
  values
    (p_horario_id, p_profesor_id, p_aula_id, current_date, p_metodo,
     p_beacon, v_estado, p_lat, p_lon)
  on conflict (horario_id, fecha) do nothing
  returning registros_asistencia.id into v_id;

  -- Si ya existía (doble registro), devolver el registro existente sin cambiarlo
  if v_id is null then
    select r.id into v_id
    from public.registros_asistencia r
    where r.horario_id = p_horario_id and r.fecha = current_date;
  end if;

  return query
    select r.id, r.fecha, r.hora_registro, r.estado, r.metodo_deteccion
    from public.registros_asistencia r
    where r.id = v_id;
end;
$$;

grant execute on function public.registrar_asistencia(uuid, uuid, uuid, text, text, float8, float8)
  to anon, authenticated;
