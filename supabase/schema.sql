-- ============================================================================
-- AsistenciaDoc · Preparatoria 21 · Universidad de Guadalajara
-- Esquema completo de base de datos para Supabase
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- El script es idempotente: puede re-ejecutarse sin duplicar objetos.
-- ============================================================================

-- ============================================================================
-- 1. TABLAS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profesores: personal docente. Se vincula a Supabase Auth vía user_id.
-- ---------------------------------------------------------------------------
create table if not exists public.profesores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  apellidos       text not null,
  correo          text not null unique,
  numero_empleado text unique,
  telefono        text,
  activo          boolean not null default true,
  admin           boolean not null default false,
  pin             text check (pin is null or pin ~ '^[0-9]{4}$'),  -- PIN para registro manual
  password_temporal boolean not null default true,  -- obliga a cambiar contraseña al 1er login
  created_at      timestamptz not null default now(),
  user_id         uuid unique references auth.users (id) on delete set null
);

-- Para bases creadas con una versión anterior del esquema
alter table public.profesores add column if not exists admin boolean not null default false;
alter table public.profesores add column if not exists pin text;
alter table public.profesores add column if not exists password_temporal boolean not null default true;

comment on table public.profesores is 'Personal docente de la Preparatoria 21';
comment on column public.profesores.user_id is 'Vincula al usuario de Supabase Auth; null hasta que el profesor active su cuenta';

-- ---------------------------------------------------------------------------
-- aulas: espacios físicos con beacon ESP32 (WiFi SSID o nombre Bluetooth)
-- ---------------------------------------------------------------------------
create table if not exists public.aulas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  edificio    text,
  beacon_id   text unique,
  beacon_tipo text check (beacon_tipo in ('wifi', 'bluetooth'))
);

comment on column public.aulas.beacon_id is 'Identificador emitido por el ESP32: SSID (wifi) o nombre del dispositivo (bluetooth)';

-- ---------------------------------------------------------------------------
-- materias: catálogo de unidades de aprendizaje
-- ---------------------------------------------------------------------------
create table if not exists public.materias (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  clave  text unique
);

-- ---------------------------------------------------------------------------
-- horarios: asignación profesor + materia + aula en un bloque semanal
-- ---------------------------------------------------------------------------
create table if not exists public.horarios (
  id          uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profesores (id) on delete cascade,
  materia_id  uuid not null references public.materias (id) on delete restrict,
  aula_id     uuid not null references public.aulas (id) on delete restrict,
  dia_semana  int  not null check (dia_semana between 1 and 6),  -- 1=Lunes … 6=Sábado
  hora_inicio time not null,
  hora_fin    time not null,
  semestre    text not null,                                     -- ej. '2025-A'
  activo      boolean not null default true,
  check (hora_fin > hora_inicio)
);

-- ---------------------------------------------------------------------------
-- registros_asistencia: marcaje de asistencia (auto-detección o manual)
-- ---------------------------------------------------------------------------
create table if not exists public.registros_asistencia (
  id               uuid primary key default gen_random_uuid(),
  horario_id       uuid not null references public.horarios (id) on delete cascade,
  profesor_id      uuid not null references public.profesores (id) on delete cascade,
  aula_id          uuid not null references public.aulas (id) on delete restrict,
  fecha            date not null default current_date,
  hora_registro    timestamptz not null default now(),
  metodo_deteccion text not null check (metodo_deteccion in ('wifi', 'bluetooth', 'manual')),
  beacon_detectado text,
  estado           text not null check (estado in ('presente', 'tarde', 'ausente')),
  latitud          float8,
  longitud         float8
);

-- Evita marcar dos veces la misma clase el mismo día
create unique index if not exists registros_unico_por_clase_dia
  on public.registros_asistencia (horario_id, fecha);

-- ============================================================================
-- 2. ÍNDICES
-- ============================================================================
create index if not exists idx_registros_profesor_id on public.registros_asistencia (profesor_id);
create index if not exists idx_registros_fecha       on public.registros_asistencia (fecha);
create index if not exists idx_registros_horario_id  on public.registros_asistencia (horario_id);
create index if not exists idx_horarios_profesor_id  on public.horarios (profesor_id);
create index if not exists idx_horarios_dia_semana   on public.horarios (dia_semana) where activo;

-- ============================================================================
-- 3. FUNCIONES AUXILIARES
-- ============================================================================

-- ¿El usuario autenticado es admin?
-- Hay dos formas de marcar a un admin (cualquiera de las dos basta):
--   a) Auth con app_metadata = {"rol": "admin"}:
--      Dashboard → Authentication → Users → (usuario) → Edit app metadata,
--      o vía Admin API: auth.admin.updateUserById(id, { app_metadata: { rol: 'admin' } })
--   b) profesores.admin = true en su ficha vinculada (user_id).
-- security definer: lee profesores sin pasar por RLS (evita recursión de políticas).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin', false)
      or exists (
        select 1 from public.profesores
        where user_id = auth.uid() and admin
      );
$$;

-- id del profesor vinculado al usuario autenticado (null si no hay vínculo)
create or replace function public.current_profesor_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.profesores where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- get_horario_activo: horario vigente para un profesor en una fecha y hora.
-- Devuelve el bloque cuyo día de semana coincide (1=Lunes…6=Sábado) y cuya
-- franja horaria contiene p_hora, junto con materia y aula para la UI.
--
-- Uso desde el cliente:
--   supabase.rpc('get_horario_activo', {
--     p_profesor_id: '…', p_fecha: '2026-06-12', p_hora: '08:15'
--   })
-- ---------------------------------------------------------------------------
create or replace function public.get_horario_activo(
  p_profesor_id uuid,
  p_fecha       date,
  p_hora        time
)
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
language sql
stable
security definer set search_path = public
as $$
  select
    h.id          as horario_id,
    m.id          as materia_id,
    m.nombre      as materia_nombre,
    m.clave       as materia_clave,
    a.id          as aula_id,
    a.nombre      as aula_nombre,
    a.edificio,
    a.beacon_id,
    a.beacon_tipo,
    h.dia_semana,
    h.hora_inicio,
    h.hora_fin,
    h.semestre
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  join public.aulas    a on a.id = h.aula_id
  where h.profesor_id = p_profesor_id
    and h.activo
    and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= h.hora_inicio
    and p_hora <  h.hora_fin
  order by h.hora_inicio
  limit 1;
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================
alter table public.profesores           enable row level security;
alter table public.aulas                enable row level security;
alter table public.materias             enable row level security;
alter table public.horarios             enable row level security;
alter table public.registros_asistencia enable row level security;

-- --- profesores: cada quien ve/edita su ficha; admin todo ------------------
drop policy if exists profesores_select on public.profesores;
create policy profesores_select on public.profesores
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists profesores_update_propio on public.profesores;
create policy profesores_update_propio on public.profesores
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists profesores_admin_all on public.profesores;
create policy profesores_admin_all on public.profesores
  for all using (public.is_admin()) with check (public.is_admin());

-- Un profesor puede editar su ficha (teléfono, etc.) pero NO los campos
-- sensibles: sin este trigger podría auto-asignarse admin = true.
create or replace function public.protege_campos_profesores()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() null = service role o SQL directo (Edge Functions, dashboard): permitido
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.admin           is distinct from old.admin
    or new.activo          is distinct from old.activo
    or new.user_id         is distinct from old.user_id
    or new.correo          is distinct from old.correo
    or new.numero_empleado is distinct from old.numero_empleado
  then
    raise exception 'Solo un administrador puede modificar estos campos';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_campos_profesores on public.profesores;
create trigger trg_protege_campos_profesores
  before update on public.profesores
  for each row execute function public.protege_campos_profesores();

-- --- aulas y materias: lectura para autenticados; escritura solo admin -----
drop policy if exists aulas_select on public.aulas;
create policy aulas_select on public.aulas
  for select using (auth.uid() is not null);

drop policy if exists aulas_admin_all on public.aulas;
create policy aulas_admin_all on public.aulas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists materias_select on public.materias;
create policy materias_select on public.materias
  for select using (auth.uid() is not null);

drop policy if exists materias_admin_all on public.materias;
create policy materias_admin_all on public.materias
  for all using (public.is_admin()) with check (public.is_admin());

-- --- horarios: el profesor ve los suyos; admin todo -------------------------
drop policy if exists horarios_select_propios on public.horarios;
create policy horarios_select_propios on public.horarios
  for select using (profesor_id = public.current_profesor_id() or public.is_admin());

drop policy if exists horarios_admin_all on public.horarios;
create policy horarios_admin_all on public.horarios
  for all using (public.is_admin()) with check (public.is_admin());

-- --- registros_asistencia: el profesor ve e inserta solo los suyos ----------
drop policy if exists registros_select_propios on public.registros_asistencia;
create policy registros_select_propios on public.registros_asistencia
  for select using (profesor_id = public.current_profesor_id() or public.is_admin());

drop policy if exists registros_insert_propios on public.registros_asistencia;
create policy registros_insert_propios on public.registros_asistencia
  for insert with check (profesor_id = public.current_profesor_id());

-- Correcciones (cambiar estado, etc.): solo admin
drop policy if exists registros_admin_all on public.registros_asistencia;
create policy registros_admin_all on public.registros_asistencia
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 5. DATOS DE PRUEBA
--    UUIDs fijos para que el seed sea reproducible y re-ejecutable.
-- ============================================================================

-- --- 3 profesores (sin user_id: se vincula cuando activen su cuenta) -------
insert into public.profesores (id, nombre, apellidos, correo, numero_empleado, telefono, pin) values
  ('11111111-1111-1111-1111-111111111101', 'María Fernanda', 'López Cervantes', 'maria.lopez@academicos.udg.mx',  'P21-0014', '3312345678', '2101'),
  ('11111111-1111-1111-1111-111111111102', 'José Luis',      'Ramírez Ochoa',   'jose.ramirez@academicos.udg.mx', 'P21-0027', '3323456789', '2102'),
  ('11111111-1111-1111-1111-111111111103', 'Adriana',        'Gutiérrez Mora',  'adriana.gutierrez@academicos.udg.mx', 'P21-0033', null, '2103')
on conflict (id) do nothing;

-- --- 2 aulas con beacon ESP32 -----------------------------------------------
insert into public.aulas (id, nombre, edificio, beacon_id, beacon_tipo) values
  ('22222222-2222-2222-2222-222222222201', 'Aula 101',    'Edificio A', 'P21-BEACON-A101', 'wifi'),
  ('22222222-2222-2222-2222-222222222202', 'Lab Cómputo', 'Edificio C', 'P21-BEACON-LABC', 'bluetooth')
on conflict (id) do nothing;

-- --- Materias (necesarias para los horarios de ejemplo) ---------------------
insert into public.materias (id, nombre, clave) values
  ('33333333-3333-3333-3333-333333333301', 'Matemáticas y Vida Cotidiana I', 'MVC-I'),
  ('33333333-3333-3333-3333-333333333302', 'Tecnologías de la Información',  'TI'),
  ('33333333-3333-3333-3333-333333333303', 'Comprensión de la Ciencia',      'CC')
on conflict (id) do nothing;

-- --- 4 horarios de ejemplo (semestre 2026-A) --------------------------------
insert into public.horarios (id, profesor_id, materia_id, aula_id, dia_semana, hora_inicio, hora_fin, semestre) values
  -- María: Matemáticas, lunes 07:00-08:55, Aula 101
  ('44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333301',
   '22222222-2222-2222-2222-222222222201',
   1, '07:00', '08:55', '2026-A'),
  -- María: Matemáticas, miércoles 07:00-08:55, Aula 101
  ('44444444-4444-4444-4444-444444444402',
   '11111111-1111-1111-1111-111111111101',
   '33333333-3333-3333-3333-333333333301',
   '22222222-2222-2222-2222-222222222201',
   3, '07:00', '08:55', '2026-A'),
  -- José Luis: Tecnologías de la Información, martes 09:00-10:55, Lab Cómputo
  ('44444444-4444-4444-4444-444444444403',
   '11111111-1111-1111-1111-111111111102',
   '33333333-3333-3333-3333-333333333302',
   '22222222-2222-2222-2222-222222222202',
   2, '09:00', '10:55', '2026-A'),
  -- Adriana: Comprensión de la Ciencia, viernes 11:00-12:55, Aula 101
  ('44444444-4444-4444-4444-444444444404',
   '11111111-1111-1111-1111-111111111103',
   '33333333-3333-3333-3333-333333333303',
   '22222222-2222-2222-2222-222222222201',
   5, '11:00', '12:55', '2026-A')
on conflict (id) do nothing;

-- ============================================================================
-- 6. VERIFICACIÓN RÁPIDA (opcional)
-- ============================================================================
-- Horario vigente de María un lunes a las 07:30:
--   select * from public.get_horario_activo(
--     '11111111-1111-1111-1111-111111111101', '2026-06-15'::date, '07:30'::time
--   );
--
-- Vincular un profesor a su cuenta de Auth una vez creada:
--   update public.profesores
--     set user_id = (select id from auth.users where email = 'maria.lopez@academicos.udg.mx')
--   where correo = 'maria.lopez@academicos.udg.mx';
-- ============================================================================
