-- ============================================================================
-- Migración: corrige ambigüedad en get_mi_resumen_asistencia
--
-- La migración 0036 cambió la firma de la función (de `p_dias int` a
-- `p_desde/p_hasta date`) usando CREATE OR REPLACE. Postgres NO reemplaza una
-- función cuando cambian los parámetros — crea una segunda función con el
-- mismo nombre. Resultado: dos versiones de get_mi_resumen_asistencia
-- coexistían, y PostgREST no podía elegir cuál usar al llamarla solo con
-- p_profesor_id → error "Could not choose the best candidate function...".
--
-- Esta migración borra AMBAS firmas posibles y recrea una sola versión limpia
-- (idéntica a la de 0036, la del periodo semanal). Idempotente — se puede
-- correr aunque solo exista una de las dos, o ninguna.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================================

drop function if exists public.get_mi_resumen_asistencia(uuid, int);
drop function if exists public.get_mi_resumen_asistencia(uuid, date, date);

create function public.get_mi_resumen_asistencia(
  p_profesor_id uuid,
  p_desde date default null,
  p_hasta date default null
)
returns table (
  total_clases int,
  presentes    int,
  tardes       int,
  faltas       int,
  justificadas int,
  pct          numeric,
  pct_tardanza numeric
)
language sql security definer set search_path = public stable as $$
  with rango as (
    select
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
      case when r.estado = 'presente' then 1 else 0 end as es_presente,
      case when r.estado = 'tarde' then 1 else 0 end as es_tarde,
      case when r.estado in ('presente', 'tarde') then 0 else 1 end as es_falta,
      case when j.id is not null then 1 else 0 end as justif
    from dias d
    join public.horarios h
      on h.activo and h.profesor_id = p_profesor_id
      and h.dia_semana = extract(isodow from d.fecha)::int
    left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = d.fecha
    left join public.justificaciones j on j.horario_id = h.id and j.fecha = d.fecha
    where (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  )
  select
    count(*)::int as total_clases,
    coalesce(sum(es_presente), 0)::int as presentes,
    coalesce(sum(es_tarde), 0)::int as tardes,
    coalesce(sum(case when es_falta = 1 and justif = 0 then 1 else 0 end), 0)::int as faltas,
    coalesce(sum(justif), 0)::int as justificadas,
    case when (count(*) - coalesce(sum(justif), 0)) > 0
         then round(100.0 * (coalesce(sum(es_presente), 0) + coalesce(sum(es_tarde), 0))
                     / (count(*) - coalesce(sum(justif), 0)), 1)
         else null end as pct,
    case when (coalesce(sum(es_presente), 0) + coalesce(sum(es_tarde), 0)) > 0
         then round(100.0 * coalesce(sum(es_tarde), 0)
                     / (coalesce(sum(es_presente), 0) + coalesce(sum(es_tarde), 0)), 1)
         else null end as pct_tardanza
  from clases;
$$;

grant execute on function public.get_mi_resumen_asistencia(uuid, date, date) to anon, authenticated;
