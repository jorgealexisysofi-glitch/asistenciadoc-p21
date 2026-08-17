-- ============================================================================
-- Migración: get_mi_asistencia (historial de asistencia del propio profesor)
--
-- Igual que el reporte del admin pero acotado a un solo profesor y SIN el
-- filtro is_admin(): el maestro entra por NIP (sin sesión), así que se pasa su
-- profesor_id. Excluye días no laborables y clases futuras.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_mi_asistencia(
  p_profesor_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
returns table (
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
    where g::date not in (select d.fecha from public.dias_no_laborables d)
  )
  select
    h.id, d.fecha, h.dia_semana, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
    r.hora_registro,
    case when r.id is null then 'falta'
         when r.estado = 'presente' then 'presente'
         when r.estado = 'tarde' then 'tarde' else 'falta' end,
    case when r.hora_registro is null then null
         else round(extract(epoch from (
           (r.hora_registro at time zone 'America/Mexico_City') - (d.fecha + h.hora_inicio)
         )) / 60)::int end,
    (j.id is not null), j.motivo
  from dias d
  join public.horarios h
    on h.activo and h.profesor_id = p_profesor_id
    and h.dia_semana = extract(isodow from d.fecha)::int
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = d.fecha
  left join public.justificaciones j on j.horario_id = h.id and j.fecha = d.fecha
  where (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by d.fecha desc, h.hora_inicio;
$$;

grant execute on function public.get_mi_asistencia(uuid, date, date) to anon, authenticated;
