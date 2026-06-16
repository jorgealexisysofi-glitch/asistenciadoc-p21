-- ============================================================================
-- Migración: RPC get_horarios_profesor
--
-- Devuelve todos los horarios activos de un profesor con materia y aula,
-- ordenados por día y hora. SECURITY DEFINER porque el profesor entra por NIP
-- (sin sesión de Supabase Auth), así que se pasa p_profesor_id en vez de
-- depender de auth.uid().
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

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
  join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id
    and h.activo
  order by h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_horarios_profesor(uuid) to anon, authenticated;
