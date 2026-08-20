-- ============================================================================
-- Migración: notificación de PRUEBA (broadcast bajo demanda)
--
-- Devuelve, para CADA dispositivo suscrito, la próxima clase de hoy del maestro
-- (ignora la ventana de tiempo y el anti-repetición). La usa la Edge Function
-- cuando se la invoca en "modo prueba", para mandar a todos a la vez.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.get_notificaciones_prueba()
returns table (endpoint text, p256dh text, auth text, titulo text, cuerpo text)
language sql security definer set search_path = public stable as $$
  with ahora as (
    select (now() at time zone 'America/Mexico_City')::date as hoy,
           (now() at time zone 'America/Mexico_City')::time as hora,
           extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int as dow
  ),
  proxima as (
    select distinct on (h.profesor_id)
           h.profesor_id, m.nombre as materia, a.nombre as aula, h.hora_inicio
    from public.horarios h
    join public.materias m on m.id = h.materia_id
    left join public.aulas a on a.id = h.aula_id
    cross join ahora an
    where h.activo and h.dia_semana = an.dow and h.hora_fin > an.hora
      and an.hoy not in (select d.fecha from public.dias_no_laborables d)
    order by h.profesor_id, h.hora_inicio
  )
  select s.endpoint, s.p256dh, s.auth,
         'Prueba · Próxima clase'::text,
         coalesce(
           px.materia || ' a las ' || to_char(px.hora_inicio, 'HH24:MI')
             || coalesce(' · ' || px.aula, ''),
           'No tienes más clases hoy. (Notificación de prueba)'
         )
  from public.push_suscripciones s
  left join proxima px on px.profesor_id = s.profesor_id;
$$;

revoke execute on function public.get_notificaciones_prueba() from public;
grant execute on function public.get_notificaciones_prueba() to service_role;
