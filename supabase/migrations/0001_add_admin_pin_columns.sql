-- ============================================================================
-- Migración: columnas faltantes en `profesores`
--
-- Diagnóstico (verificado contra la base en producción): las columnas `admin`
-- y `pin` no existían en la tabla desplegada, por lo que el PATCH de la API
-- (cambio de rol) devolvía 400 Bad Request. `password_temporal` y `user_id`
-- ya existían.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Es idempotente: puede re-ejecutarse sin error.
-- ============================================================================

-- Rol de administrador (lo lee is_admin() y la interfaz)
alter table public.profesores
  add column if not exists admin boolean not null default false;

-- PIN de 4 dígitos para el registro manual de asistencia
alter table public.profesores
  add column if not exists pin text;

-- (password_temporal ya existe; se incluye por completitud / idempotencia)
alter table public.profesores
  add column if not exists password_temporal boolean not null default true;

-- Refrescar el cache de esquema de PostgREST para que la API reconozca las
-- nuevas columnas de inmediato (sin esto, los PATCH pueden seguir dando 400).
notify pgrst, 'reload schema';

-- Verificación rápida (debe listar admin, pin y password_temporal):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profesores'
--   order by column_name;
