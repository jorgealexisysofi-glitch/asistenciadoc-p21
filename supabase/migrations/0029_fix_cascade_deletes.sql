-- ============================================================================
-- Migración: corregir borrado en cascada (FKs)
--
-- En algunas bases, las llaves foráneas hacia `profesores` y `horarios` quedaron
-- sin ON DELETE CASCADE, así que borrar un maestro (o un horario) que ya tiene
-- registros de asistencia fallaba con:
--   violates foreign key constraint "registros_asistencia_profesor_id_fkey"
--
-- Esta migración las recrea con ON DELETE CASCADE (comportamiento previsto):
--   • Borrar un maestro  → borra sus horarios, registros y justificaciones.
--   • Borrar un horario  → borra sus registros y justificaciones.
--
-- ⚠️ Esto significa que borrar un maestro/horario elimina su historial de
-- asistencia. Si quieres conservarlo, usa antes "Respaldos → Archivar".
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- registros_asistencia → profesores
alter table public.registros_asistencia drop constraint if exists registros_asistencia_profesor_id_fkey;
alter table public.registros_asistencia
  add constraint registros_asistencia_profesor_id_fkey
  foreign key (profesor_id) references public.profesores (id) on delete cascade;

-- registros_asistencia → horarios
alter table public.registros_asistencia drop constraint if exists registros_asistencia_horario_id_fkey;
alter table public.registros_asistencia
  add constraint registros_asistencia_horario_id_fkey
  foreign key (horario_id) references public.horarios (id) on delete cascade;

-- horarios → profesores
alter table public.horarios drop constraint if exists horarios_profesor_id_fkey;
alter table public.horarios
  add constraint horarios_profesor_id_fkey
  foreign key (profesor_id) references public.profesores (id) on delete cascade;

-- justificaciones → profesores / horarios (por si también quedaron sin cascada)
alter table public.justificaciones drop constraint if exists justificaciones_profesor_id_fkey;
alter table public.justificaciones
  add constraint justificaciones_profesor_id_fkey
  foreign key (profesor_id) references public.profesores (id) on delete cascade;

alter table public.justificaciones drop constraint if exists justificaciones_horario_id_fkey;
alter table public.justificaciones
  add constraint justificaciones_horario_id_fkey
  foreign key (horario_id) references public.horarios (id) on delete cascade;
