-- ============================================================================
-- Migración: exportar horarios actuales
--
-- Devuelve todos los horarios activos con la info del profesor, materia, grupo
-- y aula, para descargarlos tal como están hoy en la base. Solo admin.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_horarios_export()
returns table (
  codigo text,
  profesor text,
  materia text,
  clave text,
  grupo text,
  aula text,
  edificio text,
  dia_semana int,
  hora_inicio time,
  hora_fin time,
  semestre text
)
language sql security definer set search_path = public stable as $$
  select coalesce(p.numero_empleado, ''),
         (p.nombre || ' ' || p.apellidos),
         m.nombre,
         coalesce(m.clave, ''),
         coalesce(h.grupo, ''),
         coalesce(a.nombre, ''),
         coalesce(a.edificio, ''),
         h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  where public.is_admin() and h.activo
  order by p.apellidos, p.nombre, h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_horarios_export() to authenticated;
