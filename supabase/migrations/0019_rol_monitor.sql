-- ============================================================================
-- Migración: rol de MONITOREO (solo lectura)
--
-- Un usuario "monitor" puede VER el tablero, los reportes/actas y el dashboard,
-- pero NO puede editar nada ni ver datos sensibles de los profesores (NIP,
-- teléfono). Se marca con app_metadata.rol = 'monitor' en Supabase Auth.
--
-- Modelo:
--   • is_admin()  → escritura + lectura total (sin cambios).
--   • is_monitor()→ cuenta con rol 'monitor'.
--   • puede_ver() → is_admin() OR is_monitor(): se usa para GATEAR SOLO LECTURAS.
--
-- Las lecturas que el monitor necesita se sirven por RPCs SECURITY DEFINER que
-- devuelven únicamente lo necesario (sin NIP), para no darle acceso directo a la
-- tabla profesores. Las escrituras siguen exigiendo is_admin().
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- ---------- Roles ------------------------------------------------------------
create or replace function public.is_monitor()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'rol') = 'monitor', false);
$$;

create or replace function public.puede_ver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_monitor();
$$;

-- ---------- Lista básica de profesores (sin datos sensibles) -----------------
-- Reemplaza el `select * from profesores` en las pantallas que ve el monitor.
create or replace function public.get_profesores_basico()
returns table (
  id uuid,
  nombre text,
  apellidos text,
  numero_empleado text,
  activo boolean
)
language sql security definer set search_path = public stable as $$
  select p.id, p.nombre, p.apellidos, p.numero_empleado, p.activo
  from public.profesores p
  where public.puede_ver()
  order by p.apellidos, p.nombre;
$$;

-- ---------- Registros de un día (para el dashboard) --------------------------
create or replace function public.get_registros_dia(p_fecha date)
returns table (
  id uuid,
  profesor_id uuid,
  profesor_nombre text,
  profesor_apellidos text,
  materia_nombre text,
  aula_nombre text,
  hora_registro timestamptz,
  hora_salida timestamptz,
  estado text,
  metodo_deteccion text
)
language sql security definer set search_path = public stable as $$
  select r.id, r.profesor_id, p.nombre, p.apellidos, m.nombre, a.nombre,
         r.hora_registro, r.hora_salida, r.estado, r.metodo_deteccion
  from public.registros_asistencia r
  join public.profesores p on p.id = r.profesor_id
  left join public.horarios h on h.id = r.horario_id
  left join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = r.aula_id
  where public.puede_ver() and r.fecha = p_fecha
  order by r.hora_registro desc nulls last;
$$;

-- ---------- KPIs del dashboard ----------------------------------------------
-- Mismos cálculos que hacía el cliente, ahora en el servidor (sin exponer
-- profesores). "Ahora"/"esta semana" se calculan en hora de México.
create or replace function public.get_dashboard_kpis()
returns table (
  activos int,
  registradas_hoy int,
  pct_semana int,
  en_clase int
)
language sql security definer set search_path = public stable as $$
  with t as (
    select
      (now() at time zone 'America/Mexico_City')::date as hoy,
      (now() at time zone 'America/Mexico_City')::time as hora,
      extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int as dow
  ),
  lun as (select (t.hoy - ((t.dow - 1) || ' days')::interval)::date as lunes from t),
  esperadas as (
    select count(*)::int as n from public.horarios h, t
    where h.activo and (h.dia_semana < t.dow or (h.dia_semana = t.dow and h.hora_inicio <= t.hora))
  ),
  asistidas as (
    select count(*)::int as n from public.registros_asistencia r, t, lun
    where r.fecha between lun.lunes and t.hoy and r.estado <> 'ausente'
  )
  select
    (select count(*)::int from public.profesores where activo),
    (select count(*)::int from public.registros_asistencia r, t where r.fecha = t.hoy),
    case when (select n from esperadas) > 0
         then least(100, round((select n from asistidas)::numeric / (select n from esperadas) * 100))::int
         else null end,
    (select count(distinct h.profesor_id)::int from public.horarios h, t
      where h.activo and h.dia_semana = t.dow and h.hora_inicio <= t.hora and t.hora < h.hora_fin)
  where public.puede_ver();
$$;

grant execute on function public.is_monitor() to anon, authenticated;
grant execute on function public.puede_ver() to anon, authenticated;
grant execute on function public.get_profesores_basico() to authenticated;
grant execute on function public.get_registros_dia(date) to authenticated;
grant execute on function public.get_dashboard_kpis() to authenticated;

-- ============================================================================
-- Reabrir las RPCs de solo lectura al monitor: is_admin() → puede_ver()
-- (mismo cuerpo que la versión vigente, solo cambia el filtro de acceso)
-- ============================================================================

-- Reporte / acta
create or replace function public.generar_reporte_asistencia(
  p_fecha_desde date, p_fecha_hasta date, p_profesor_id uuid default null
)
returns table (
  profesor_id uuid, profesor_nombre text, profesor_apellidos text, horario_id uuid,
  fecha date, dia_semana int, materia_nombre text, aula_nombre text,
  hora_inicio time, hora_fin time, hora_registro timestamptz, hora_salida timestamptz,
  estado text, diferencia_min int, justificado boolean, motivo text
)
language sql security definer set search_path = public stable as $$
  with dias as (
    select g::date as fecha
    from generate_series(p_fecha_desde, p_fecha_hasta, interval '1 day') as g
    where g::date not in (select d.fecha from public.dias_no_laborables d)
  )
  select
    p.id, p.nombre, p.apellidos, h.id, d.fecha, h.dia_semana, m.nombre, a.nombre,
    h.hora_inicio, h.hora_fin, r.hora_registro, r.hora_salida,
    case when r.id is null then 'falta'
         when r.estado = 'presente' then 'presente'
         when r.estado = 'tarde' then 'tarde' else 'falta' end,
    case when r.hora_registro is null then null
         else round(extract(epoch from (
           (r.hora_registro at time zone 'America/Mexico_City') - (d.fecha + h.hora_inicio)
         )) / 60)::int end,
    (j.id is not null), j.motivo
  from dias d
  join public.horarios h on h.activo and h.dia_semana = extract(isodow from d.fecha)::int
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = d.fecha
  left join public.justificaciones j on j.horario_id = h.id and j.fecha = d.fecha
  where public.puede_ver()
    and (p_profesor_id is null or h.profesor_id = p_profesor_id)
    and (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by p.apellidos, p.nombre, d.fecha, h.hora_inicio;
$$;

-- Tablero "Clases ahora"
create or replace function public.get_clases_en_curso(p_fecha date, p_hora time)
returns table (
  horario_id uuid, profesor_nombre text, profesor_apellidos text, materia_nombre text,
  aula_nombre text, hora_inicio time, hora_fin time, registrado boolean,
  estado text, hora_registro timestamptz, hora_salida timestamptz
)
language sql security definer set search_path = public stable as $$
  select h.id, p.nombre, p.apellidos, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
         (r.id is not null), r.estado, r.hora_registro, r.hora_salida
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = p_fecha
  where public.puede_ver()
    and h.activo and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= h.hora_inicio and p_hora < h.hora_fin
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by a.nombre, p.apellidos;
$$;

-- Próximas clases
create or replace function public.get_proximas_clases(
  p_fecha date, p_hora time, p_minutos int default 15
)
returns table (
  horario_id uuid, profesor_nombre text, profesor_apellidos text, materia_nombre text,
  aula_nombre text, hora_inicio time, hora_fin time, minutos_para int, registrado boolean
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
  where public.puede_ver()
    and h.activo and h.dia_semana = extract(isodow from p_fecha)::int
    and h.hora_inicio > p_hora
    and h.hora_inicio <= (p_hora + make_interval(mins => coalesce(p_minutos, 15)))
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by h.hora_inicio, a.nombre, p.apellidos;
$$;
