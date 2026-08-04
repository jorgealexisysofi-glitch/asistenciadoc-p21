-- ============================================================================
-- Migración: correo opcional en profesores
--
-- Los profesores inician sesión con número de empleado + NIP, no con correo.
-- Para poder crearlos por lote al importar horarios (el Excel de cargas no trae
-- correo), se hace la columna correo NULLABLE. Sigue siendo unique (Postgres
-- permite múltiples NULL en índices únicos), así que no hay duplicados falsos.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

alter table public.profesores alter column correo drop not null;
