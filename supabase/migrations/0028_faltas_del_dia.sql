-- ============================================================================
-- Migración: faltas del día (para el correo resumen)
--
-- Devuelve las clases de HOY (o de p_fecha) que quedaron sin registro y sin
-- justificar = faltas. Una fila por clase no asistida (un maestro con 3 faltas
-- aparece 3 veces). Excluye días no laborables y clases que aún no empiezan.
-- La usa la Edge Function `resumen-faltas` (service_role) al final del día.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_faltas_del_dia(p_fecha date default null)
returns table (
  profesor_nombre text,
  profesor_apellidos text,
  correo text,
  materia text,
  aula text,
  hora_inicio time,
  hora_fin time
)
language sql security definer set search_path = public stable as $$
  with f as (
    select coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date) as dia
  )
  select p.nombre, p.apellidos, p.correo, m.nombre, a.nombre, h.hora_inicio, h.hora_fin
  from f
  join public.horarios h on h.activo and h.dia_semana = extract(isodow from f.dia)::int
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = f.dia
  left join public.justificaciones j on j.horario_id = h.id and j.fecha = f.dia
  where f.dia not in (select d.fecha from public.dias_no_laborables d)
    and r.id is null   -- sin registro = falta
    and j.id is null   -- no justificada
    and (f.dia + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by p.apellidos, p.nombre, h.hora_inicio;
$$;

revoke execute on function public.get_faltas_del_dia(date) from public;
grant execute on function public.get_faltas_del_dia(date) to service_role;

-- ============================================================================
-- CRON (opcional): correo diario a las 22:00 hora de México (04:00 UTC).
-- Requiere pg_cron + pg_net. Reemplaza <PROJECT-REF> y <SERVICE_ROLE_KEY>:
--
--   select cron.schedule(
--     'resumen-faltas-diario', '0 4 * * *',
--     $$
--       select net.http_post(
--         url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/resumen-faltas',
--         headers := jsonb_build_object(
--                      'Content-Type','application/json',
--                      'Authorization','Bearer <SERVICE_ROLE_KEY>')
--       );
--     $$
--   );
-- ============================================================================
