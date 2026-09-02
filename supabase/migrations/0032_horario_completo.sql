-- ============================================================================
-- Migración: horario completo del profesor (para caché offline)
--
-- Devuelve TODAS las clases activas del profesor con los mismos datos que
-- get_horario_activo (aula, beacon, día y hora), para que la app las guarde en
-- el dispositivo y pueda determinar la clase actual y registrar SIN internet.
--
-- Acotada a p_profesor_id (el maestro entra por NIP, sin sesión Supabase), como
-- get_horario_activo. Ejecutar en: Supabase → SQL Editor → Run. Idempotente.
-- ============================================================================

create or replace function public.get_horario_completo(p_profesor_id uuid)
returns table (
  horario_id     uuid,
  materia_id     uuid,
  materia_nombre text,
  materia_clave  text,
  aula_id        uuid,
  aula_nombre    text,
  edificio       text,
  beacon_id      text,
  beacon_tipo    text,
  dia_semana     int,
  hora_inicio    time,
  hora_fin       time,
  semestre       text
)
language sql security definer set search_path = public stable as $$
  select h.id, m.id, m.nombre, m.clave,
         a.id, a.nombre, a.edificio, a.beacon_id, a.beacon_tipo::text,
         h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id and h.activo
  order by h.dia_semana, h.hora_inicio;
$$;

grant execute on function public.get_horario_completo(uuid) to anon, authenticated;
