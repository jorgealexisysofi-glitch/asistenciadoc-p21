-- ============================================================================
-- Migración: registro offline con hora real (p_momento)
--
-- Para que un registro hecho SIN conexión y sincronizado más tarde quede a la
-- hora en que realmente ocurrió (no a la hora de sincronización), las RPCs
-- aceptan un parámetro opcional p_momento (timestamptz):
--   • null  → registro en línea: el servidor usa now() (comportamiento normal).
--   • dado  → registro offline reenviado: se usa esa hora para fecha, estado y
--             hora_registro / hora_salida.
--
-- Se agrega un argumento, así que hay que DROP FUNCTION de la firma anterior
-- antes de recrear. Idempotente. Ejecutar en Supabase → SQL Editor → Run.
-- ============================================================================

-- ---------- registrar_asistencia (entrada) ----------------------------------
drop function if exists public.registrar_asistencia(uuid, uuid, uuid, text, text, float8, float8);

create or replace function public.registrar_asistencia(
  p_profesor_id uuid,
  p_horario_id uuid,
  p_aula_id uuid,
  p_metodo text,
  p_beacon text,
  p_lat float8,
  p_lon float8,
  p_momento timestamptz default null
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
  v_inicio  time;
  v_estado  text;
  v_id      uuid;
  v_momento timestamptz := coalesce(p_momento, now());
  v_local   time := (v_momento at time zone 'America/Mexico_City')::time;
  v_fecha   date := (v_momento at time zone 'America/Mexico_City')::date;
begin
  select h.hora_inicio into v_inicio from public.horarios h where h.id = p_horario_id;

  -- Estado según la hora REAL del registro (10 min de tolerancia).
  if v_inicio is null or v_local <= v_inicio + interval '10 minutes' then
    v_estado := 'presente';
  else
    v_estado := 'tarde';
  end if;

  insert into public.registros_asistencia as ra
        (horario_id, profesor_id, aula_id, fecha, hora_registro, metodo_deteccion,
         beacon_detectado, estado, latitud, longitud)
  values (p_horario_id, p_profesor_id, p_aula_id, v_fecha, v_momento, p_metodo,
         p_beacon, v_estado, p_lat, p_lon)
  on conflict (horario_id, fecha) do nothing
  returning ra.id into v_id;

  -- Si ya existía (doble registro / reintento), recuperar sin modificar.
  if v_id is null then
    select ra.id into v_id
      from public.registros_asistencia ra
     where ra.horario_id = p_horario_id and ra.fecha = v_fecha;
  end if;

  return query
    select ra.id, ra.fecha, ra.hora_registro, ra.estado, ra.metodo_deteccion
      from public.registros_asistencia ra
     where ra.id = v_id;
end;
$$;

grant execute on function
  public.registrar_asistencia(uuid, uuid, uuid, text, text, float8, float8, timestamptz)
  to anon, authenticated;

-- ---------- registrar_salida ------------------------------------------------
drop function if exists public.registrar_salida(uuid, uuid, date);

create or replace function public.registrar_salida(
  p_profesor_id uuid,
  p_horario_id uuid,
  p_fecha date,
  p_momento timestamptz default null
)
returns table (hora_salida timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_fin     time;
  v_momento timestamptz := coalesce(p_momento, now());
  v_hora    time := (v_momento at time zone 'America/Mexico_City')::time;
begin
  select h.hora_fin into v_fin from public.horarios h where h.id = p_horario_id;
  if v_fin is null then
    raise exception 'Horario no encontrado';
  end if;

  -- Ventana según la hora REAL de la salida (±30 min del fin).
  if v_hora < (v_fin - interval '30 minutes')
     or v_hora > (v_fin + interval '30 minutes') then
    raise exception 'Fuera de la ventana para firmar salida';
  end if;

  update public.registros_asistencia ra
     set hora_salida = coalesce(ra.hora_salida, v_momento)
   where ra.horario_id = p_horario_id
     and ra.fecha = p_fecha
     and ra.profesor_id = p_profesor_id;

  if not found then
    raise exception 'Primero debes firmar tu entrada';
  end if;

  return query
    select ra.hora_salida
      from public.registros_asistencia ra
     where ra.horario_id = p_horario_id
       and ra.fecha = p_fecha
       and ra.profesor_id = p_profesor_id;
end; $$;

grant execute on function public.registrar_salida(uuid, uuid, date, timestamptz)
  to anon, authenticated;
