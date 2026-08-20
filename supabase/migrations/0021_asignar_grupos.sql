-- ============================================================================
-- Migración: asignar grupos a horarios EXISTENTES (sin borrar ni duplicar)
--
-- Rellena la columna `grupo` de los horarios que ya están cargados, emparejando
-- cada fila del Excel de cargas con el horario existente por:
--   código de profesor (numero_empleado) + día + hora de inicio + hora de fin.
-- Ese trío identifica una clase de forma única (un profesor no puede estar en
-- dos lugares a la misma hora), así que NO se tocan asistencias ni se duplican
-- horarios: solo se actualiza el campo grupo.
--
-- Recibe un arreglo JSON de asignaciones y devuelve cuántas clases se
-- actualizaron. Solo admin.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

create or replace function public.asignar_grupos_por_carga(p_filas jsonb)
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

  for v_elem in select * from jsonb_array_elements(p_filas)
  loop
    update public.horarios h
       set grupo = nullif(btrim(v_elem ->> 'grupo'), '')
      from public.profesores p
     where h.profesor_id = p.id
       and h.activo
       and btrim(coalesce(p.numero_empleado, '')) = btrim(coalesce(v_elem ->> 'codigo', ''))
       and btrim(coalesce(v_elem ->> 'codigo', '')) <> ''
       and h.dia_semana = (v_elem ->> 'dia_semana')::int
       and h.hora_inicio = (v_elem ->> 'hora_inicio')::time
       and h.hora_fin = (v_elem ->> 'hora_fin')::time;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end; $$;

grant execute on function public.asignar_grupos_por_carga(jsonb) to authenticated;
