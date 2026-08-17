-- ============================================================================
-- Migración: get_proximas_clases (clases que están por comenzar)
--
-- Para el tablero "Clases ahora": lista las clases cuyo inicio cae dentro de
-- los próximos 15 minutos (aún no empiezan). Mismo criterio que
-- get_clases_en_curso: solo admin, excluye días no laborables.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_proximas_clases(
  p_fecha date,
  p_hora time,
  p_minutos int default 15
)
returns table (
  horario_id uuid,
  profesor_nombre text,
  profesor_apellidos text,
  materia_nombre text,
  aula_nombre text,
  hora_inicio time,
  hora_fin time,
  minutos_para int,
  registrado boolean
)
language sql security definer set search_path = public stable as $$
  select h.id, p.nombre, p.apellidos, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
         ceil(extract(epoch from (h.hora_inicio - p_hora)) / 60)::int,
         (r.id is not null)
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = p_fecha
  where public.is_admin()
    and h.activo and h.dia_semana = extract(isodow from p_fecha)::int
    and h.hora_inicio > p_hora
    and h.hora_inicio <= (p_hora + make_interval(mins => coalesce(p_minutos, 15)))
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by h.hora_inicio, a.nombre, p.apellidos;
$$;

grant execute on function public.get_proximas_clases(date, time, int) to authenticated;
