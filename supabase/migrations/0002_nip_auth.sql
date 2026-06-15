-- ============================================================================
-- Migración: autenticación por número de empleado + NIP
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente.
-- ============================================================================

-- 1. Columnas de NIP en profesores (NIP inicial = 2126, número de la prepa)
alter table public.profesores
  add column if not exists nip text not null default '2126',
  add column if not exists nip_temporal boolean not null default true;

-- ============================================================================
-- 2. RPCs de autenticación (SECURITY DEFINER)
--
-- El login NO usa un SELECT directo desde el navegador a propósito: eso
-- requeriría una política RLS que dejaría los NIP de todo el personal legibles
-- con la anon key. Estas funciones leen profesores en el servidor y solo
-- devuelven/actualizan la fila cuando las credenciales coinciden exactamente,
-- sin exponer la tabla ni permitir enumerar NIP.
-- ============================================================================

-- Verifica número de empleado + NIP y devuelve los datos de sesión si coinciden
create or replace function public.verificar_nip(
  p_numero_empleado text,
  p_nip text
)
returns table (
  id uuid,
  nombre text,
  apellidos text,
  admin boolean,
  nip_temporal boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select id, nombre, apellidos, admin, nip_temporal
  from public.profesores
  where numero_empleado = p_numero_empleado
    and nip = p_nip
    and activo = true
  limit 1;
$$;

-- Cambia el NIP si el actual coincide; devuelve true si se actualizó
create or replace function public.cambiar_nip(
  p_profesor_id uuid,
  p_nip_actual text,
  p_nip_nuevo text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  update public.profesores
    set nip = p_nip_nuevo, nip_temporal = false
    where id = p_profesor_id
      and nip = p_nip_actual
      and activo = true;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- Estas funciones se invocan sin sesión (anon) desde el navegador
grant execute on function public.verificar_nip(text, text) to anon, authenticated;
grant execute on function public.cambiar_nip(uuid, text, text) to anon, authenticated;

-- Verificación rápida:
--   select * from public.verificar_nip('P21-0014', '2126');
