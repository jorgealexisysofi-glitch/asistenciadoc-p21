-- ============================================================================
-- Migración: días no laborables, bitácora de correcciones y fusionar profesores
--
-- 1. Tabla dias_no_laborables (festivos/suspensiones → no generan faltas)
-- 2. Tabla bitacora_correcciones (auditoría de quién corrigió/justificó)
-- 3. Los RPCs de corrección/justificación registran en la bitácora
-- 4. get_bitacora (ver la auditoría) y fusionar_profesores (unir duplicados)
-- 5. generar_reporte_asistencia y get_clases_en_curso excluyen días no laborables
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- ---------- 1. Días no laborables --------------------------------------------
create table if not exists public.dias_no_laborables (
  fecha date primary key,
  motivo text not null default '',
  created_at timestamptz not null default now()
);
alter table public.dias_no_laborables enable row level security;
drop policy if exists dias_no_laborables_admin_all on public.dias_no_laborables;
create policy dias_no_laborables_admin_all on public.dias_no_laborables
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- 2. Bitácora de correcciones --------------------------------------
create table if not exists public.bitacora_correcciones (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid,
  fecha date,
  profesor_id uuid,
  accion text not null,        -- 'estado' | 'justificar' | 'quitar_justif'
  detalle text not null default '',
  admin_email text,
  created_at timestamptz not null default now()
);
alter table public.bitacora_correcciones enable row level security;
drop policy if exists bitacora_admin_read on public.bitacora_correcciones;
create policy bitacora_admin_read on public.bitacora_correcciones
  for select using (public.is_admin());

-- ---------- 3. RPCs de corrección/justificación con bitácora -----------------
create or replace function public.justificar_clase(
  p_horario_id uuid, p_fecha date, p_motivo text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_profesor uuid;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede justificar clases'; end if;
  select h.profesor_id into v_profesor from public.horarios h where h.id = p_horario_id;
  if v_profesor is null then return false; end if;
  insert into public.justificaciones (horario_id, profesor_id, fecha, motivo)
  values (p_horario_id, v_profesor, p_fecha, coalesce(p_motivo, ''))
  on conflict (horario_id, fecha) do update set motivo = excluded.motivo;
  insert into public.bitacora_correcciones (horario_id, fecha, profesor_id, accion, detalle, admin_email)
  values (p_horario_id, p_fecha, v_profesor, 'justificar', coalesce(p_motivo, ''),
          auth.jwt() ->> 'email');
  return true;
end; $$;

create or replace function public.quitar_justificacion(
  p_horario_id uuid, p_fecha date
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_profesor uuid;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede modificar justificaciones'; end if;
  select h.profesor_id into v_profesor from public.horarios h where h.id = p_horario_id;
  delete from public.justificaciones j where j.horario_id = p_horario_id and j.fecha = p_fecha;
  insert into public.bitacora_correcciones (horario_id, fecha, profesor_id, accion, detalle, admin_email)
  values (p_horario_id, p_fecha, v_profesor, 'quitar_justif', '', auth.jwt() ->> 'email');
  return true;
end; $$;

create or replace function public.corregir_asistencia(
  p_horario_id uuid, p_fecha date, p_estado text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_profesor uuid; v_aula uuid;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede corregir asistencias'; end if;
  if p_estado not in ('presente', 'tarde', 'falta') then raise exception 'Estado inválido'; end if;
  select h.profesor_id, h.aula_id into v_profesor, v_aula from public.horarios h where h.id = p_horario_id;
  if v_profesor is null then return false; end if;
  if p_estado = 'falta' then
    delete from public.registros_asistencia r where r.horario_id = p_horario_id and r.fecha = p_fecha;
  else
    insert into public.registros_asistencia
      (horario_id, profesor_id, aula_id, fecha, metodo_deteccion, estado)
    values (p_horario_id, v_profesor, v_aula, p_fecha, 'correccion', p_estado)
    on conflict (horario_id, fecha) do update
      set estado = excluded.estado, metodo_deteccion = 'correccion', hora_registro = now();
  end if;
  insert into public.bitacora_correcciones (horario_id, fecha, profesor_id, accion, detalle, admin_email)
  values (p_horario_id, p_fecha, v_profesor, 'estado', p_estado, auth.jwt() ->> 'email');
  return true;
end; $$;

-- ---------- 4. Ver bitácora y fusionar profesores ----------------------------
create or replace function public.get_bitacora(p_limit int default 200)
returns table (
  created_at timestamptz, admin_email text, accion text, detalle text,
  fecha date, profesor_nombre text, materia_nombre text
)
language sql security definer set search_path = public stable as $$
  select b.created_at, b.admin_email, b.accion, b.detalle, b.fecha,
         p.nombre || ' ' || p.apellidos, m.nombre
  from public.bitacora_correcciones b
  left join public.profesores p on p.id = b.profesor_id
  left join public.horarios h on h.id = b.horario_id
  left join public.materias m on m.id = h.materia_id
  where public.is_admin()
  order by b.created_at desc
  limit greatest(p_limit, 1);
$$;

-- Une un profesor duplicado (origen) en otro (destino): mueve horarios,
-- registros y justificaciones, y borra el origen.
create or replace function public.fusionar_profesores(
  p_origen uuid, p_destino uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede fusionar profesores'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino no pueden ser el mismo'; end if;

  update public.horarios set profesor_id = p_destino where profesor_id = p_origen;
  update public.registros_asistencia set profesor_id = p_destino where profesor_id = p_origen;
  update public.justificaciones set profesor_id = p_destino where profesor_id = p_origen;
  delete from public.profesores where id = p_origen;
  return true;
end; $$;

-- ---------- 5. Excluir días no laborables en reporte y tablero ---------------
create or replace function public.generar_reporte_asistencia(
  p_fecha_desde date, p_fecha_hasta date, p_profesor_id uuid default null
)
returns table (
  profesor_id uuid, profesor_nombre text, profesor_apellidos text, horario_id uuid,
  fecha date, dia_semana int, materia_nombre text, aula_nombre text,
  hora_inicio time, hora_fin time, hora_registro timestamptz, estado text,
  diferencia_min int, justificado boolean, motivo text
)
language sql security definer set search_path = public stable as $$
  with dias as (
    select g::date as fecha
    from generate_series(p_fecha_desde, p_fecha_hasta, interval '1 day') as g
    where g::date not in (select d.fecha from public.dias_no_laborables d)
  )
  select
    p.id, p.nombre, p.apellidos, h.id, d.fecha, h.dia_semana, m.nombre, a.nombre,
    h.hora_inicio, h.hora_fin, r.hora_registro,
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
  where public.is_admin()
    and (p_profesor_id is null or h.profesor_id = p_profesor_id)
    and (d.fecha + h.hora_inicio) <= (now() at time zone 'America/Mexico_City')
  order by p.apellidos, p.nombre, d.fecha, h.hora_inicio;
$$;

create or replace function public.get_clases_en_curso(p_fecha date, p_hora time)
returns table (
  horario_id uuid, profesor_nombre text, profesor_apellidos text, materia_nombre text,
  aula_nombre text, hora_inicio time, hora_fin time, registrado boolean,
  estado text, hora_registro timestamptz
)
language sql security definer set search_path = public stable as $$
  select h.id, p.nombre, p.apellidos, m.nombre, a.nombre, h.hora_inicio, h.hora_fin,
         (r.id is not null), r.estado, r.hora_registro
  from public.horarios h
  join public.profesores p on p.id = h.profesor_id
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  left join public.registros_asistencia r on r.horario_id = h.id and r.fecha = p_fecha
  where public.is_admin()
    and h.activo and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= h.hora_inicio and p_hora < h.hora_fin
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by a.nombre, p.apellidos;
$$;

grant execute on function public.get_bitacora(int) to authenticated;
grant execute on function public.fusionar_profesores(uuid, uuid) to authenticated;
