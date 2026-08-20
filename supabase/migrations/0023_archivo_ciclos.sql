-- ============================================================================
-- Migración: archivo de ciclos (respaldo dentro del sistema)
--
-- Al cambiar de ciclo, "Archivar" mueve todo lo del ciclo actual (horarios con
-- grupos, asistencias y justificaciones) a tablas de archivo y limpia las vistas
-- normales. Queda guardado en un menú de Respaldos desde donde se puede:
--   • Restaurar  → vuelve a colocarlo como ciclo activo.
--   • Borrar     → lo elimina definitivamente.
--
-- Los MAESTROS, materias y aulas NO se archivan ni se borran: se conservan
-- (persisten entre ciclos y son necesarios para poder restaurar).
--
-- Los datos se guardan como JSONB (una copia fiel de cada fila), así que la
-- restauración reconstruye las filas idénticas (mismos id → las asistencias
-- siguen ligadas a su horario).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- ---------- Tablas de archivo ------------------------------------------------
create table if not exists public.ciclos_archivados (
  id          uuid primary key default gen_random_uuid(),
  etiqueta    text,
  creado_en   timestamptz not null default now(),
  creado_por  text,
  n_horarios  int not null default 0,
  n_registros int not null default 0
);

create table if not exists public.horarios_archivo (
  archivo_id uuid not null references public.ciclos_archivados (id) on delete cascade,
  datos      jsonb not null
);
create table if not exists public.registros_archivo (
  archivo_id uuid not null references public.ciclos_archivados (id) on delete cascade,
  datos      jsonb not null
);
create table if not exists public.justificaciones_archivo (
  archivo_id uuid not null references public.ciclos_archivados (id) on delete cascade,
  datos      jsonb not null
);

create index if not exists idx_horarios_archivo   on public.horarios_archivo (archivo_id);
create index if not exists idx_registros_archivo  on public.registros_archivo (archivo_id);
create index if not exists idx_justif_archivo      on public.justificaciones_archivo (archivo_id);

alter table public.ciclos_archivados       enable row level security;
alter table public.horarios_archivo        enable row level security;
alter table public.registros_archivo       enable row level security;
alter table public.justificaciones_archivo enable row level security;

drop policy if exists ciclos_admin on public.ciclos_archivados;
create policy ciclos_admin on public.ciclos_archivados
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists horarios_archivo_admin on public.horarios_archivo;
create policy horarios_archivo_admin on public.horarios_archivo
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists registros_archivo_admin on public.registros_archivo;
create policy registros_archivo_admin on public.registros_archivo
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists justif_archivo_admin on public.justificaciones_archivo;
create policy justif_archivo_admin on public.justificaciones_archivo
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Borrar TODOS los grupos (solo limpia la etiqueta) ----------------
create or replace function public.borrar_todos_grupos()
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede borrar grupos';
  end if;
  update public.horarios set grupo = null where grupo is not null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- ---------- Archivar el ciclo actual ----------------------------------------
create or replace function public.archivar_ciclo(p_etiqueta text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_h int; v_r int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede archivar ciclos';
  end if;

  insert into public.ciclos_archivados (etiqueta, creado_por)
    values (nullif(btrim(p_etiqueta), ''), auth.jwt() ->> 'email')
    returning id into v_id;

  insert into public.horarios_archivo (archivo_id, datos)
    select v_id, to_jsonb(h) from public.horarios h;
  insert into public.registros_archivo (archivo_id, datos)
    select v_id, to_jsonb(r) from public.registros_asistencia r;
  insert into public.justificaciones_archivo (archivo_id, datos)
    select v_id, to_jsonb(j) from public.justificaciones j;

  select count(*) into v_h from public.horarios;
  select count(*) into v_r from public.registros_asistencia;
  update public.ciclos_archivados set n_horarios = v_h, n_registros = v_r where id = v_id;

  -- Limpiar lo vivo (los hijos primero; horarios al final).
  delete from public.registros_asistencia;
  delete from public.justificaciones;
  delete from public.horarios;

  return v_id;
end; $$;

-- ---------- Restaurar un ciclo archivado ------------------------------------
create or replace function public.restaurar_ciclo(p_archivo_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede restaurar ciclos';
  end if;
  if exists (select 1 from public.horarios) then
    raise exception 'Hay un ciclo activo. Archívalo o límpialo antes de restaurar otro.';
  end if;

  insert into public.horarios
    select (jsonb_populate_record(null::public.horarios, datos)).*
    from public.horarios_archivo where archivo_id = p_archivo_id;
  get diagnostics v_n = row_count;

  insert into public.registros_asistencia
    select (jsonb_populate_record(null::public.registros_asistencia, datos)).*
    from public.registros_archivo where archivo_id = p_archivo_id;

  insert into public.justificaciones
    select (jsonb_populate_record(null::public.justificaciones, datos)).*
    from public.justificaciones_archivo where archivo_id = p_archivo_id;

  -- Ya está vivo: se elimina del archivo (cascade borra sus filas).
  delete from public.ciclos_archivados where id = p_archivo_id;

  return v_n;
end; $$;

-- ---------- Borrar un archivo definitivamente -------------------------------
create or replace function public.borrar_archivo_ciclo(p_archivo_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede borrar respaldos';
  end if;
  delete from public.ciclos_archivados where id = p_archivo_id; -- cascade
end; $$;

-- ---------- Lista de respaldos ----------------------------------------------
create or replace function public.get_archivos()
returns table (
  id uuid, etiqueta text, creado_en timestamptz,
  n_horarios int, n_registros int, creado_por text
)
language sql security definer set search_path = public stable as $$
  select c.id, c.etiqueta, c.creado_en, c.n_horarios, c.n_registros, c.creado_por
  from public.ciclos_archivados c
  where public.is_admin()
  order by c.creado_en desc;
$$;

grant execute on function public.borrar_todos_grupos() to authenticated;
grant execute on function public.archivar_ciclo(text) to authenticated;
grant execute on function public.restaurar_ciclo(uuid) to authenticated;
grant execute on function public.borrar_archivo_ciclo(uuid) to authenticated;
grant execute on function public.get_archivos() to authenticated;
