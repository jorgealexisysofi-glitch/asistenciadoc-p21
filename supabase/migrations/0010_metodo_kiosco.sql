-- ============================================================================
-- Migración: método de detección 'kiosco' (punto de control presencial)
--
-- Los registros hechos desde la pantalla de punto de control (/checador) se
-- marcan con metodo_deteccion = 'kiosco' para distinguirlos en reportes de los
-- manuales del teléfono y de los detectados por beacon.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

alter table public.registros_asistencia
  drop constraint if exists registros_asistencia_metodo_deteccion_check;

alter table public.registros_asistencia
  add constraint registros_asistencia_metodo_deteccion_check
  check (metodo_deteccion in ('wifi', 'bluetooth', 'manual', 'kiosco'));
