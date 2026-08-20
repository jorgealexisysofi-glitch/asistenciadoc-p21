-- ============================================================================
-- Migración: eliminar horarios duplicados (sin perder asistencias)
--
-- Un "duplicado" son dos o más horarios con el mismo profesor + materia + día +
-- hora inicio + hora fin + semestre. Se conserva UNA copia por grupo (la que
-- tiene MÁS registros de asistencia; en empate, la de menor id) y se eliminan
-- las copias sobrantes SOLO si no tienen ningún registro. Las copias que sí
-- tienen asistencias NO se borran nunca (se reportan para revisión manual).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

-- ---------- Vista previa (no borra nada) ------------------------------------
create or replace function public.preview_duplicados_horario()
returns table (eliminables int, con_registros int)
language sql security definer set search_path = public stable as $$
  with conteo as (
    select h.id, h.profesor_id, h.materia_id, h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre,
           (select count(*) from public.registros_asistencia r where r.horario_id = h.id) as nreg
    from public.horarios h
  ),
  rankeado as (
    select id, nreg,
           row_number() over (
             partition by profesor_id, materia_id, dia_semana, hora_inicio, hora_fin, semestre
             order by nreg desc, id asc
           ) as rn
    from conteo
  )
  select
    coalesce(count(*) filter (where rn > 1 and nreg = 0), 0)::int,
    coalesce(count(*) filter (where rn > 1 and nreg > 0), 0)::int
  from rankeado
  where public.is_admin();
$$;

-- ---------- Eliminar duplicados ---------------------------------------------
create or replace function public.eliminar_duplicados_horario()
returns table (eliminados int, conservados_con_registros int)
language plpgsql security definer set search_path = public as $$
declare v_del int; v_keep int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede eliminar duplicados';
  end if;

  create temp table _dup on commit drop as
  with conteo as (
    select h.id, h.profesor_id, h.materia_id, h.dia_semana, h.hora_inicio, h.hora_fin, h.semestre,
           (select count(*) from public.registros_asistencia r where r.horario_id = h.id) as nreg
    from public.horarios h
  ),
  rankeado as (
    select id, nreg,
           row_number() over (
             partition by profesor_id, materia_id, dia_semana, hora_inicio, hora_fin, semestre
             order by nreg desc, id asc
           ) as rn
    from conteo
  )
  select id, nreg from rankeado where rn > 1;

  select coalesce(count(*) filter (where nreg > 0), 0)::int into v_keep from _dup;

  delete from public.horarios where id in (select id from _dup where nreg = 0);
  get diagnostics v_del = row_count;

  return query select v_del, v_keep;
end; $$;

grant execute on function public.preview_duplicados_horario() to authenticated;
grant execute on function public.eliminar_duplicados_horario() to authenticated;
