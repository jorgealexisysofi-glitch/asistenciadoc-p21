-- ============================================================================
-- Migración: get_horarios_profesor ahora incluye el grupo
--
-- Para que el horario del maestro pueda mostrar el grupo de cada clase.
-- Cambia el tipo de retorno (agrega `grupo`), así que hay que DROP FUNCTION
-- antes de recrear (error 42P13 si no). Idempotente.
-- Ejecutar en: Supabase → SQL Editor → New query → Run.
-- ============================================================================

drop function if exists public.get_horarios_profesor(uuid);

create function public.get_horarios_profesor(p_profesor_id uuid)
returns table (
  horario_id uuid,
  materia_nombre text,
  materia_clave text,
  aula_nombre text,
  edificio text,
  dia_semana int,
  hora_inicio time,
  hora_fin time,
  semestre text,
  grupo text
)
language sql security definer set search_path = public stable as $$
  select h.id, m.nombre, m.clave, a.nombre, a.edificio,
         h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre, coalesce(h.grupo, '')
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id and h.activo
  order by h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_horarios_profesor(uuid) to anon, authenticated;
