-- ============================================================================
-- Migración: asignar grupos a horarios EXISTENTES (sin borrar ni duplicar)
--
-- Rellena la columna `grupo` de horarios ya cargados. El emparejado (qué grupo
-- va a qué horario) lo resuelve el cliente en la sección Grupos, reusando la
-- misma lógica del importador (profesor por código o nombre + día + hora), y
-- aquí solo se aplican las actualizaciones por id. Así NO se tocan asistencias
-- ni se duplican horarios: solo se escribe el campo grupo.
--
-- Recibe un arreglo JSON [{ horario_id, grupo }, …] y devuelve cuántos horarios
-- se actualizaron. Solo admin.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.set_grupos_horarios(p_asignaciones jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_elem  jsonb;
  v_total int := 0;
  v_n     int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar grupos';
  end if;

  for v_elem in select * from jsonb_array_elements(p_asignaciones)
  loop
    update public.horarios
       set grupo = nullif(btrim(v_elem ->> 'grupo'), '')
     where id = (v_elem ->> 'horario_id')::uuid;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end; $$;

grant execute on function public.set_grupos_horarios(jsonb) to authenticated;
