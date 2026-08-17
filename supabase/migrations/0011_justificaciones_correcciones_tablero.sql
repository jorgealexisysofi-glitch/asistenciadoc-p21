-- ============================================================================
-- Migración: justificaciones, correcciones de asistencia y tablero en vivo
--
-- 1. Tabla `justificaciones` (una clase concreta marcada como justificada)
-- 2. registros_asistencia: aula opcional + método 'correccion'
-- 3. RPCs: justificar_clase, quitar_justificacion, corregir_asistencia
-- 4. generar_reporte_asistencia v2 (incluye horario_id, justificado, motivo)
-- 5. get_clases_en_curso (tablero "quién está en clase ahora")
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- ---------- 1. Tabla de justificaciones --------------------------------------
create table if not exists public.justificaciones (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horarios (id) on delete cascade,
  profesor_id uuid not null references public.profesores (id) on delete cascade,
  fecha date not null,
  motivo text not null default '',
  created_at timestamptz not null default now(),
  unique (horario_id, fecha)
);

alter table public.justificaciones enable row level security;

drop policy if exists justificaciones_admin_all on public.justificaciones;
create policy justificaciones_admin_all on public.justificaciones
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- 2. registros_asistencia: aula opcional + método corrección --------
alter table public.registros_asistencia alter column aula_id drop not null;

alter table public.registros_asistencia
  drop constraint if exists registros_asistencia_metodo_deteccion_check;
alter table public.registros_asistencia
  add constraint registros_asistencia_metodo_deteccion_check
  check (metodo_deteccion in ('wifi', 'bluetooth', 'manual', 'kiosco', 'correccion'));

-- ---------- 3. RPCs de corrección/justificación (solo admin) ------------------

-- Justifica (o actualiza el motivo de) una clase concreta
create or replace function public.justificar_clase(
  p_horario_id uuid,
  p_fecha date,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profesor uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede justificar clases';
  end if;
  select h.profesor_id into v_profesor from public.horarios h where h.id = p_horario_id;
  if v_profesor is null then
    return false;
  end if;
  insert into public.justificaciones (horario_id, profesor_id, fecha, motivo)
  values (p_horario_id, v_profesor, p_fecha, coalesce(p_motivo, ''))
  on conflict (horario_id, fecha) do update set motivo = excluded.motivo;
  return true;
end;
$$;

-- Quita la justificación de una clase
create or replace function public.quitar_justificacion(
  p_horario_id uuid,
  p_fecha date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede modificar justificaciones';
  end if;
  delete from public.justificaciones j
  where j.horario_id = p_horario_id and j.fecha = p_fecha;
  return true;
end;
$$;

-- Corrige el estado de una clase: 'presente'/'tarde' crea/actualiza el registro;
-- 'falta' elimina el registro (vuelve a ser ausencia).
create or replace function public.corregir_asistencia(
  p_horario_id uuid,
  p_fecha date,
  p_estado text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profesor uuid;
  v_aula uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede corregir asistencias';
  end if;
  if p_estado not in ('presente', 'tarde', 'falta') then
    raise exception 'Estado inválido';
  end if;

  select h.profesor_id, h.aula_id into v_profesor, v_aula
  from public.horarios h where h.id = p_horario_id;
  if v_profesor is null then
    return false;
  end if;

  if p_estado = 'falta' then
    delete from public.registros_asistencia r
    where r.horario_id = p_horario_id and r.fecha = p_fecha;
  else
    insert into public.registros_asistencia
      (horario_id, profesor_id, aula_id, fecha, metodo_deteccion, estado)
    values
      (p_horario_id, v_profesor, v_aula, p_fecha, 'correccion', p_estado)
    on conflict (horario_id, fecha) do update
      set estado = excluded.estado,
          metodo_deteccion = 'correccion',
          hora_registro = now();
  end if;
  return true;
end;
$$;

-- ---------- 4. generar_reporte_asistencia v2 ---------------------------------
-- Se agregan columnas al retorno (horario_id, justificado, motivo), así que hay
-- que borrar la versión anterior antes de recrearla.
drop function if exists public.generar_reporte_asistencia(date, date, uuid);

create or replace function public.generar_reporte_asistencia(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_profesor_id uuid default null
)
returns table (
  profesor_id uuid,
  profesor_nombre text,
  profesor_apellidos text,
  horario_id uuid,
  fecha date,
  dia_semana int,
  materia_nombre text,
  aula_nombre text,
  hora_inicio time,
  hora_fin time,
  hora_registro timestamptz,
  estado text,
  diferencia_min int,
  justificado boolean,
  motivo text
)
language sql
security definer
set search_path = public
stable
as $$
  with dias as (
    select g::date as fecha
    from generate_series(p_fecha_desde, p_fecha_hasta, interval '1 day') as g
  )
  select
    p.id, p.nombre, p.apellidos,
    h.id, d.fecha, h.dia_semana, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
    r.hora_registro,
    case
      when r.id is null then 'falta'
      when r.estado = 'presente' then 'presente'
      when r.estado = 'tarde' then 'tarde'
      else 'falta'
    end as estado,
    case
      when r.hora_registro is null then null
      else round(extract(epoch from (
        (r.hora_registro at time zone 'America/Mexico_City') - (d.fecha + h.hora_inicio)
      )) / 60)::int
    end as diferencia_min,
    (j.id is not null) as justificado,
    j.motivo
  from dias d
  join public.horarios h
    on h.activo and h.dia_semana = extract(isodow from d.fecha)::int
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = d.fecha
  left join public.justificaciones j on j.horario_id = h.id and j.fecha = d.fecha
  where public.is_admin()
    and (p_profesor_id is null or h.profesor_id = p_profesor_id)
    and (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by p.apellidos, p.nombre, d.fecha, h.hora_inicio;
$$;

-- ---------- 5. Tablero: clases en curso ahora --------------------------------
create or replace function public.get_clases_en_curso(
  p_fecha date,
  p_hora time
)
returns table (
  horario_id uuid,
  profesor_nombre text,
  profesor_apellidos text,
  materia_nombre text,
  aula_nombre text,
  hora_inicio time,
  hora_fin time,
  registrado boolean,
  estado text,
  hora_registro timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    h.id, p.nombre, p.apellidos, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
    (r.id is not null) as registrado,
    r.estado,
    r.hora_registro
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = p_fecha
  where public.is_admin()
    and h.activo
    and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= h.hora_inicio
    and p_hora < h.hora_fin
  order by a.nombre, p.apellidos;
$$;

grant execute on function public.justificar_clase(uuid, date, text) to authenticated;
grant execute on function public.quitar_justificacion(uuid, date) to authenticated;
grant execute on function public.corregir_asistencia(uuid, date, text) to authenticated;
grant execute on function public.get_clases_en_curso(date, time) to authenticated;
