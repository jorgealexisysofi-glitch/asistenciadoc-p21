-- ============================================================================
-- Migración: horario por salón (aula)
--
-- Para imprimir el horario de cada salón (qué clase, grupo y profesor hay en él
-- cada día/hora). Dos RPCs de solo lectura (admin):
--   • get_aulas_horario()      → aulas que tienen clases, con su número de clases.
--   • get_horario_aula(uuid)   → horario semanal de un salón.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_aulas_horario()
returns table (aula_id uuid, aula_nombre text, edificio text, clases int)
language sql security definer set search_path = public stable as $$
  select a.id, a.nombre, a.edificio, count(*)::int
  from public.horarios h
  join public.aulas a on a.id = h.aula_id
  where public.is_admin() and h.activo
  group by a.id, a.nombre, a.edificio
  order by a.nombre;
$$;

create or replace function public.get_horario_aula(p_aula_id uuid)
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
  profesor_nombre text
)
language sql security definer set search_path = public stable as $$
  select h.id, m.nombre, m.clave, a.nombre, a.edificio,
         h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre,
         case when coalesce(h.grupo, '') <> '' then h.grupo || ' · ' || p.apellidos
              else (p.nombre || ' ' || p.apellidos) end
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  join public.profesores p on p.id = h.profesor_id
  left join public.aulas a on a.id = h.aula_id
  where public.is_admin() and h.activo and h.aula_id = p_aula_id
  order by h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_aulas_horario() to authenticated;
grant execute on function public.get_horario_aula(uuid) to authenticated;
