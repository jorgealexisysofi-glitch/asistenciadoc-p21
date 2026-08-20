-- ============================================================================
-- Migración: grupos de alumnos
--
-- Cada bloque de horario (profesor + materia + día/hora) pertenece a un grupo
-- de alumnos (p. ej. '1A', '301'). Se agrega la columna `grupo` a horarios (la
-- llena el importador desde la columna de grupo del Excel de cargas) y dos RPCs
-- para el panel de admin:
--   • get_grupos()            → lista de grupos con su número de clases.
--   • get_horario_grupo(txt)  → horario semanal de un grupo (materia, profesor,
--                               aula, día y hora) para verlo e imprimirlo.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

alter table public.horarios add column if not exists grupo text;

create index if not exists idx_horarios_grupo
  on public.horarios (grupo) where grupo is not null;

-- ---------- Lista de grupos --------------------------------------------------
create or replace function public.get_grupos()
returns table (grupo text, clases int)
language sql security definer set search_path = public stable as $$
  select h.grupo, count(*)::int
  from public.horarios h
  where public.is_admin()
    and h.activo
    and h.grupo is not null and btrim(h.grupo) <> ''
  group by h.grupo
  order by h.grupo;
$$;

-- ---------- Horario semanal de un grupo -------------------------------------
create or replace function public.get_horario_grupo(p_grupo text)
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
         (p.nombre || ' ' || p.apellidos)
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  join public.profesores p on p.id = h.profesor_id
  left join public.aulas a on a.id = h.aula_id
  where public.is_admin()
    and h.activo
    and h.grupo = p_grupo
  order by h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_grupos() to authenticated;
grant execute on function public.get_horario_grupo(text) to authenticated;
