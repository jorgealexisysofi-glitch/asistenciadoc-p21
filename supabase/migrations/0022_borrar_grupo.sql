-- ============================================================================
-- Migración: borrar (desasignar) un grupo
--
-- "Borrar un grupo" solo limpia la etiqueta `grupo` de las clases de ese grupo
-- (grupo = null). NO borra horarios ni asistencias: la clase sigue existiendo,
-- solo deja de estar agrupada. Devuelve cuántas clases se desagruparon.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.borrar_grupo(p_grupo text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede borrar grupos';
  end if;
  update public.horarios set grupo = null where grupo = p_grupo;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

grant execute on function public.borrar_grupo(text) to authenticated;
