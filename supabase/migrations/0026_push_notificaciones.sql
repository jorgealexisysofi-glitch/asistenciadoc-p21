-- ============================================================================
-- Migración: notificaciones push (Web Push)
--
-- Tablas y RPCs para enviar recordatorios a los maestros:
--   • push_suscripciones: el dispositivo suscrito de cada maestro.
--   • notificaciones_log: evita reenviar el mismo aviso (profesor+clase+día+tipo).
--   • guardar_suscripcion / borrar_suscripcion: las llama la app (sesión por NIP)
--     vía SECURITY DEFINER, acotadas a p_profesor_id.
--   • get_notificaciones_pendientes / registrar_notificacion_enviada: las llama
--     la Edge Function (service_role) cada ~5 min. NO expuestas a anon/authenticated.
--
-- Tiempos (estándar): próxima clase 15 min antes; recordar entrada en los
-- primeros 15 min si no registró; firmar salida 10 min antes de terminar.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create table if not exists public.push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesores (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_push_profesor on public.push_suscripciones (profesor_id);

create table if not exists public.notificaciones_log (
  profesor_id uuid not null,
  horario_id  uuid not null,
  fecha       date not null,
  tipo        text not null,           -- 'proxima' | 'entrada' | 'salida'
  enviado_en  timestamptz not null default now(),
  primary key (profesor_id, horario_id, fecha, tipo)
);

alter table public.push_suscripciones enable row level security;
alter table public.notificaciones_log enable row level security;
-- Sin políticas permisivas: el acceso es solo por las RPCs (definer) y service_role.

-- ---------- Guardar / borrar la suscripción del dispositivo (app) -----------
create or replace function public.guardar_suscripcion(
  p_profesor_id uuid, p_endpoint text, p_p256dh text, p_auth text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_suscripciones (profesor_id, endpoint, p256dh, auth)
  values (p_profesor_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profesor_id = excluded.profesor_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end; $$;

create or replace function public.borrar_suscripcion(p_endpoint text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_suscripciones where endpoint = p_endpoint;
end; $$;

grant execute on function public.guardar_suscripcion(uuid, text, text, text) to anon, authenticated;
grant execute on function public.borrar_suscripcion(text) to anon, authenticated;

-- ---------- Cola de notificaciones a enviar ahora (Edge Function) ------------
create or replace function public.get_notificaciones_pendientes()
returns table (
  profesor_id uuid, endpoint text, p256dh text, auth text,
  tipo text, titulo text, cuerpo text, horario_id uuid, fecha date
)
language sql security definer set search_path = public stable as $$
  with ahora as (
    select (now() at time zone 'America/Mexico_City')::date as hoy,
           (now() at time zone 'America/Mexico_City')::time as hora,
           extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int as dow
  ),
  clases as (
    select h.id as horario_id, h.profesor_id, m.nombre as materia, a.nombre as aula,
           h.hora_inicio, h.hora_fin, an.hoy, an.hora
    from public.horarios h
    join public.materias m on m.id = h.materia_id
    left join public.aulas a on a.id = h.aula_id
    cross join ahora an
    where h.activo and h.dia_semana = an.dow
      and an.hoy not in (select d.fecha from public.dias_no_laborables d)
  ),
  eventos as (
    -- Próxima clase (15 min antes de iniciar)
    select c.horario_id, c.profesor_id, c.hoy as fecha, 'proxima'::text as tipo,
           'Próxima clase'::text as titulo,
           (c.materia || ' a las ' || to_char(c.hora_inicio, 'HH24:MI')
             || coalesce(' · ' || c.aula, '')) as cuerpo
    from clases c
    where c.hora_inicio > c.hora and c.hora_inicio <= (c.hora + interval '15 minutes')
    union all
    -- Recordar registrar entrada (primeros 15 min, si no registró)
    select c.horario_id, c.profesor_id, c.hoy, 'entrada',
           'Registra tu asistencia',
           ('No olvides registrar tu entrada de ' || c.materia || '.')
    from clases c
    where c.hora >= c.hora_inicio and c.hora <= (c.hora_inicio + interval '15 minutes')
      and not exists (
        select 1 from public.registros_asistencia r
        where r.horario_id = c.horario_id and r.fecha = c.hoy
      )
    union all
    -- Recordar firmar salida (10 min antes de terminar, si ya entró y no ha salido)
    select c.horario_id, c.profesor_id, c.hoy, 'salida',
           'Firma tu salida',
           ('Tu clase de ' || c.materia || ' está por terminar. No olvides firmar tu salida.')
    from clases c
    where c.hora >= (c.hora_fin - interval '10 minutes') and c.hora <= c.hora_fin
      and exists (
        select 1 from public.registros_asistencia r
        where r.horario_id = c.horario_id and r.fecha = c.hoy and r.hora_salida is null
      )
  )
  select e.profesor_id, s.endpoint, s.p256dh, s.auth, e.tipo, e.titulo, e.cuerpo,
         e.horario_id, e.fecha
  from eventos e
  join public.push_suscripciones s on s.profesor_id = e.profesor_id
  where not exists (
    select 1 from public.notificaciones_log l
    where l.profesor_id = e.profesor_id and l.horario_id = e.horario_id
      and l.fecha = e.fecha and l.tipo = e.tipo
  );
$$;

create or replace function public.registrar_notificacion_enviada(
  p_profesor_id uuid, p_horario_id uuid, p_fecha date, p_tipo text
)
returns void
language sql security definer set search_path = public as $$
  insert into public.notificaciones_log (profesor_id, horario_id, fecha, tipo)
  values (p_profesor_id, p_horario_id, p_fecha, p_tipo)
  on conflict do nothing;
$$;

-- Solo la Edge Function (service_role) puede leer la cola y registrar envíos.
revoke execute on function public.get_notificaciones_pendientes() from public;
revoke execute on function public.registrar_notificacion_enviada(uuid, uuid, date, text) from public;
grant execute on function public.get_notificaciones_pendientes() to service_role;
grant execute on function public.registrar_notificacion_enviada(uuid, uuid, date, text) to service_role;

-- ============================================================================
-- CRON (opcional, se activa aparte): dispara la Edge Function cada 5 minutos.
-- Requiere las extensiones pg_cron y pg_net (Dashboard → Database → Extensions).
-- Reemplaza <PROJECT-REF> y <SERVICE_ROLE_KEY> por los de tu proyecto y ejecuta:
--
--   select cron.schedule(
--     'enviar-notificaciones', '*/5 * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://<PROJECT-REF>.functions.supabase.co/enviar-notificaciones',
--         headers := jsonb_build_object(
--                      'Content-Type','application/json',
--                      'Authorization','Bearer <SERVICE_ROLE_KEY>')
--       );
--     $$
--   );
-- ============================================================================
