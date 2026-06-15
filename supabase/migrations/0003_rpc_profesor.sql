-- ============================================================================
-- Migración: RPCs de profesor (SECURITY DEFINER)
--
-- Los profesores se autentican por NIP y NO tienen sesión de Supabase Auth,
-- así que auth.uid() es null y las políticas RLS rechazan sus operaciones.
-- Estas funciones reciben p_profesor_id como parámetro y corren con privilegios
-- del definidor (omiten RLS), permitiendo leer/registrar la asistencia del
-- profesor sin sesión.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- get_horario_activo ya existe (migración base) y NO depende de auth.uid():
-- recibe p_profesor_id, p_fecha, p_hora. No requiere cambios.

-- ---------------------------------------------------------------------------
-- Próxima clase de hoy que aún no termina (para ProfesorHome)
-- ---------------------------------------------------------------------------
create or replace function public.get_proxima_clase(
  p_profesor_id uuid,
  p_fecha date,
  p_hora time
)
returns table (
  horario_id uuid,
  materia_nombre text,
  materia_clave text,
  aula_nombre text,
  edificio text,
  hora_inicio time,
  hora_fin time
)
language sql
security definer
set search_path = public
stable
as $$
  select h.id, m.nombre, m.clave, a.nombre, a.edificio, h.hora_inicio, h.hora_fin
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id
    and h.activo
    and h.dia_semana = extract(isodow from p_fecha)::int
    and h.hora_fin > p_hora
  order by h.hora_inicio
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Últimos registros de asistencia con materia y aula embebidas
-- ---------------------------------------------------------------------------
create or replace function public.get_historial_profesor(
  p_profesor_id uuid,
  p_limit int default 5
)
returns table (
  id uuid,
  fecha date,
  hora_registro timestamptz,
  metodo_deteccion text,
  estado text,
  materia_nombre text,
  aula_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.fecha, r.hora_registro, r.metodo_deteccion, r.estado,
         m.nombre, a.nombre
  from public.registros_asistencia r
  left join public.horarios h on h.id = r.horario_id
  left join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = r.aula_id
  where r.profesor_id = p_profesor_id
  order by r.hora_registro desc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- Registro de asistencia de una clase concreta hoy (para ValidarAsistencia)
-- ---------------------------------------------------------------------------
create or replace function public.get_registro_clase(
  p_profesor_id uuid,
  p_horario_id uuid,
  p_fecha date
)
returns table (id uuid, estado text, hora_registro timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select id, estado, hora_registro
  from public.registros_asistencia
  where profesor_id = p_profesor_id
    and horario_id = p_horario_id
    and fecha = p_fecha
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Registrar asistencia (idempotente por el índice único horario_id + fecha).
-- El estado (presente/tarde) se calcula en el servidor con la hora local.
-- ---------------------------------------------------------------------------
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
  select hora_inicio into v_inicio from public.horarios where id = p_horario_id;

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
    select registros_asistencia.id into v_id
    from public.registros_asistencia
    where horario_id = p_horario_id and fecha = current_date;
  end if;

  return query
    select r.id, r.fecha, r.hora_registro, r.estado, r.metodo_deteccion
    from public.registros_asistencia r
    where r.id = v_id;
end;
$$;

-- Estas funciones se invocan sin sesión (anon) desde el navegador
grant execute on function public.get_proxima_clase(uuid, date, time) to anon, authenticated;
grant execute on function public.get_historial_profesor(uuid, int) to anon, authenticated;
grant execute on function public.get_registro_clase(uuid, uuid, date) to anon, authenticated;
grant execute on function public.registrar_asistencia(uuid, uuid, uuid, text, text, float8, float8)
  to anon, authenticated;
