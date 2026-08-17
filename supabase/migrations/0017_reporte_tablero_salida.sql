-- ============================================================================
-- Migración: hora_salida en el reporte del admin, el acta y el tablero
--
-- 1. generar_reporte_asistencia (reportes + acta mensual) → añade hora_salida
-- 2. get_clases_en_curso (tablero "Clases ahora")         → añade hora_salida
--
-- Ambas cambian su tipo de retorno, así que hay que DROP FUNCTION antes de
-- recrearlas (error 42P13 si no). Idempotente.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================================

-- ---------- 1. Reporte / acta -----------------------------------------------
drop function if exists public.generar_reporte_asistencia(date, date, uuid);

create function public.generar_reporte_asistencia(
  p_fecha_desde date, p_fecha_hasta date, p_profesor_id uuid default null
)
returns table (
  profesor_id uuid, profesor_nombre text, profesor_apellidos text, horario_id uuid,
  fecha date, dia_semana int, materia_nombre text, aula_nombre text,
  hora_inicio time, hora_fin time, hora_registro timestamptz, hora_salida timestamptz,
  estado text, diferencia_min int, justificado boolean, motivo text
)
language sql security definer set search_path = public stable as $$
  with dias as (
    select g::date as fecha
    from generate_series(p_fecha_desde, p_fecha_hasta, interval '1 day') as g
    where g::date not in (select d.fecha from public.dias_no_laborables d)
  )
  select
    p.id, p.nombre, p.apellidos, h.id, d.fecha, h.dia_semana, m.nombre, a.nombre,
    h.hora_inicio, h.hora_fin, r.hora_registro, r.hora_salida,
    case when r.id is null then 'falta'
         when r.estado = 'presente' then 'presente'
         when r.estado = 'tarde' then 'tarde' else 'falta' end,
    case when r.hora_registro is null then null
         else round(extract(epoch from (
           (r.hora_registro at time zone 'America/Mexico_City') - (d.fecha + h.hora_inicio)
         )) / 60)::int end,
    (j.id is not null), j.motivo
  from dias d
  join public.horarios h on h.activo and h.dia_semana = extract(isodow from d.fecha)::int
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

-- ---------- 2. Tablero "Clases ahora" ---------------------------------------
drop function if exists public.get_clases_en_curso(date, time);

create function public.get_clases_en_curso(p_fecha date, p_hora time)
returns table (
  horario_id uuid, profesor_nombre text, profesor_apellidos text, materia_nombre text,
  aula_nombre text, hora_inicio time, hora_fin time, registrado boolean,
  estado text, hora_registro timestamptz, hora_salida timestamptz
)
language sql security definer set search_path = public stable as $$
  select h.id, p.nombre, p.apellidos, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
         (r.id is not null), r.estado, r.hora_registro, r.hora_salida
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = p_fecha
  where public.is_admin()
    and h.activo and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= h.hora_inicio and p_hora < h.hora_fin
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by a.nombre, p.apellidos;
$$;
