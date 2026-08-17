-- ============================================================================
-- Migración: firmar salida al terminar la clase
--
-- Agrega la columna `hora_salida` al registro de asistencia y dos RPCs:
--   • get_clase_para_salida: clase del profesor cuya ventana de salida está
--     abierta ahora (desde 30 min antes del fin hasta 30 min después). Requiere
--     que ya exista el registro de ENTRADA (join interno a registros_asistencia).
--   • registrar_salida: sella hora_salida = now() si estamos dentro de la
--     ventana y ya se firmó la entrada. No sobrescribe una salida ya firmada.
--
-- Nota: la función se controla desde el frontend con la constante
-- FIRMAR_SALIDA_HABILITADO (hoy en false). El backend queda listo para cuando
-- se active. Ventana de ±30 min: ver SALIDA_ANTES_MIN / SALIDA_DESPUES_MIN.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
-- ============================================================================

alter table public.registros_asistencia
  add column if not exists hora_salida timestamptz;

-- ---------- Clase con ventana de salida abierta ahora ------------------------
create or replace function public.get_clase_para_salida(
  p_profesor_id uuid,
  p_fecha date,
  p_hora time
)
returns table (
  horario_id uuid,
  materia_nombre text,
  aula_nombre text,
  hora_inicio time,
  hora_fin time,
  hora_salida timestamptz
)
language sql security definer set search_path = public stable as $$
  select h.id, m.nombre, a.nombre, h.hora_inicio, h.hora_fin, r.hora_salida
  from public.horarios h
  join public.materias m on m.id = h.materia_id
  left join public.aulas a on a.id = h.aula_id
  join public.registros_asistencia r
    on r.horario_id = h.id and r.fecha = p_fecha and r.profesor_id = p_profesor_id
  where h.activo and h.profesor_id = p_profesor_id
    and h.dia_semana = extract(isodow from p_fecha)::int
    and p_hora >= (h.hora_fin - interval '30 minutes')
    and p_hora <= (h.hora_fin + interval '30 minutes')
    and p_fecha not in (select d.fecha from public.dias_no_laborables d)
  order by h.hora_fin
  limit 1;
$$;

-- ---------- Sellar la salida -------------------------------------------------
create or replace function public.registrar_salida(
  p_profesor_id uuid,
  p_horario_id uuid,
  p_fecha date
)
returns table (hora_salida timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_fin  time;
  v_now  timestamptz := now();
  v_hora time := (now() at time zone 'America/Mexico_City')::time;
begin
  select h.hora_fin into v_fin from public.horarios h where h.id = p_horario_id;
  if v_fin is null then
    raise exception 'Horario no encontrado';
  end if;

  -- Ventana: desde 30 min antes del fin hasta 30 min después.
  if v_hora < (v_fin - interval '30 minutes')
     or v_hora > (v_fin + interval '30 minutes') then
    raise exception 'Fuera de la ventana para firmar salida';
  end if;

  -- Sella la salida sobre el registro de entrada; no la sobrescribe si ya existe.
  update public.registros_asistencia ra
     set hora_salida = coalesce(ra.hora_salida, v_now)
   where ra.horario_id = p_horario_id
     and ra.fecha = p_fecha
     and ra.profesor_id = p_profesor_id;

  if not found then
    raise exception 'Primero debes firmar tu entrada';
  end if;

  return query
    select ra.hora_salida
      from public.registros_asistencia ra
     where ra.horario_id = p_horario_id
       and ra.fecha = p_fecha
       and ra.profesor_id = p_profesor_id;
end; $$;

grant execute on function public.get_clase_para_salida(uuid, date, time) to anon, authenticated;
grant execute on function public.registrar_salida(uuid, uuid, date) to anon, authenticated;
