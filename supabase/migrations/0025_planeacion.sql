-- ============================================================================
-- Migración: datos para el planificador de horarios ("importar horarios previos")
--
-- Devuelve los horarios activos con la info necesaria para cargarlos en el
-- planificador visual y seguir ajustando desde ahí (sin partir de cero).
-- Solo lectura, solo admin.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_horarios_planeacion()
returns table (
  codigo text,
  profesor text,
  materia text,
  clave text,
  aula text,
  grupo text,
  dia_semana int,
  hora_inicio time,
  hora_fin time
)
language sql security definer set search_path = public stable as $$
  select coalesce(p.numero_empleado, ''),
         (p.nombre || ' ' || p.apellidos),
         m.nombre,
         coalesce(m.clave, ''),
         coalesce(a.nombre, ''),
         coalesce(h.grupo, ''),
         h.dia_semana, h.hora_inicio, h.hora_fin
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  where public.is_admin() and h.activo
  order by p.apellidos, p.nombre, h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_horarios_planeacion() to authenticated;
