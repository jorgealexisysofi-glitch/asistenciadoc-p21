-- ============================================================================
-- Migración: el ranking de asistencia pasa a ser SEMANAL ("Maestro de la Semana")
--
-- Cambia solo el periodo por defecto de get_ranking_asistencia: antes era el
-- mes en curso, ahora es la semana en curso (lunes → hoy). El cálculo del % es
-- el mismo. Firma igual, así que basta CREATE OR REPLACE. Idempotente.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================================

create or replace function public.get_ranking_asistencia(
  p_desde date default null,
  p_hasta date default null,
  p_limit int  default 10
)
returns table (
  profesor_id   uuid,
  nombre        text,
  apellidos     text,
  total_clases  int,
  asistencias   int,
  justificadas  int,
  pct           numeric
)
language sql security definer set search_path = public stable as $$
  with rango as (
    select
      -- date_trunc('week') en Postgres arranca el LUNES
      coalesce(p_desde, date_trunc('week', (now() at time zone 'America/Mexico_City'))::date) as desde,
      coalesce(p_hasta, (now() at time zone 'America/Mexico_City')::date) as hasta
  ),
  dias as (
    select g::date as fecha
    from rango,
         generate_series((select desde from rango), (select hasta from rango), interval '1 day') as g
    where g::date not in (select d.fecha from public.dias_no_laborables d)
  ),
  clases as (
    select
      h.profesor_id,
      case when r.estado in ('presente', 'tarde') then 1 else 0 end as asistio,
      case when j.id is not null then 1 else 0 end as justif
    from dias d
    join public.horarios h
      on h.activo and h.dia_semana = extract(isodow from d.fecha)::int
    left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = d.fecha
    left join public.justificaciones j on j.horario_id = h.id and j.fecha = d.fecha
    where (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  ),
  agg as (
    select
      c.profesor_id,
      count(*)::int         as total_clases,
      sum(c.asistio)::int   as asistencias,
      sum(c.justif)::int    as justificadas
    from clases c
    group by c.profesor_id
  )
  select
    a.profesor_id, p.nombre, p.apellidos,
    a.total_clases, a.asistencias, a.justificadas,
    round(100.0 * a.asistencias / (a.total_clases - a.justificadas), 1) as pct
  from agg a
  join public.profesores p on p.id = a.profesor_id and p.activo
  where (a.total_clases - a.justificadas) > 0
  order by pct desc, a.asistencias desc, p.apellidos, p.nombre
  limit greatest(p_limit, 1);
$$;

grant execute on function public.get_ranking_asistencia(date, date, int) to anon, authenticated;
