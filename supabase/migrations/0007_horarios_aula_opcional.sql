-- ============================================================================
-- Migración: aula opcional en horarios (importación sin aula)
--
-- Los horarios importados desde Excel no traen aula; se asigna después en
-- /admin/asignar-aulas. Por eso aula_id pasa a ser NULLABLE y las RPCs que
-- muestran horarios usan LEFT JOIN para no ocultar las clases sin aula.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

alter table public.horarios alter column aula_id drop not null;

-- get_horarios_profesor: LEFT JOIN aulas (clases sin aula muestran aula_nombre nulo)
create or replace function public.get_horarios_profesor(p_profesor_id uuid)
returns table (
  horario_id uuid,
  materia_nombre text,
  materia_clave text,
  aula_nombre text,
  edificio text,
  dia_semana int,
  hora_inicio time,
  hora_fin time,
  semestre text
)
language sql
security definer
set search_path = public
stable
as $$
  select h.id, m.nombre, m.clave, a.nombre, a.edificio,
         h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id
    and h.activo
  order by h.dia_semana, h.hora_inicio;
$$;

-- get_proxima_clase: LEFT JOIN aulas
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
  left join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id
    and h.activo
    and h.dia_semana = extract(isodow from p_fecha)::int
    and h.hora_fin > p_hora
  order by h.hora_inicio
  limit 1;
$$;

grant execute on function public.get_horarios_profesor(uuid) to anon, authenticated;
grant execute on function public.get_proxima_clase(uuid, date, time) to anon, authenticated;
