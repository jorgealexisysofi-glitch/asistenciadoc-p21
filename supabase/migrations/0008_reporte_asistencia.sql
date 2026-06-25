-- ============================================================================
-- Migración: RPC generar_reporte_asistencia
--
-- Cruza los horarios (recurrentes por día de la semana) contra las fechas
-- reales del rango y los registros de asistencia, para producir el detalle
-- clase por clase. Una "falta" es una clase esperada que ya pasó y no tiene
-- registro (o tiene registro 'ausente').
--
-- SECURITY DEFINER + filtro is_admin(): solo un administrador obtiene datos
-- (devuelve vacío para cualquier otro), aunque la función esté concedida.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.generar_reporte_asistencia(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_profesor_id uuid default null
)
returns table (
  profesor_id uuid,
  profesor_nombre text,
  profesor_apellidos text,
  fecha date,
  dia_semana int,
  materia_nombre text,
  aula_nombre text,
  hora_inicio time,
  hora_fin time,
  hora_registro timestamptz,
  estado text,
  diferencia_min int
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
    p.id,
    p.nombre,
    p.apellidos,
    d.fecha,
    h.dia_semana,
    m.nombre,
    a.nombre,
    h.hora_inicio,
    h.hora_fin,
    r.hora_registro,
    case
      when r.id is null then 'falta'
      when r.estado = 'presente' then 'presente'
      when r.estado = 'tarde' then 'tarde'
      else 'falta'  -- 'ausente' u otro → falta
    end as estado,
    case
      when r.hora_registro is null then null
      else round(
        extract(epoch from (
          (r.hora_registro at time zone 'America/Mexico_City')
          - (d.fecha + h.hora_inicio)
        )) / 60
      )::int
    end as diferencia_min
  from dias d
  join public.horarios h
    on h.activo
    and h.dia_semana = extract(isodow from d.fecha)::int
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r
    on r.horario_id = h.id and r.fecha = d.fecha
  where public.is_admin()
    and (p_profesor_id is null or h.profesor_id = p_profesor_id)
    -- Solo clases cuyo inicio ya pasó (no se cuentan faltas de clases futuras)
    and (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by p.apellidos, p.nombre, d.fecha, h.hora_inicio;
$$;

grant execute on function public.generar_reporte_asistencia(date, date, uuid)
  to anon, authenticated;
