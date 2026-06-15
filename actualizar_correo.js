// actualizar_correo.js
// Actualiza el correo de un profesor TANTO en Supabase Auth como en la tabla
// profesores. El frontend solo puede cambiar la tabla, por lo que sin este
// script el profesor seguiría iniciando sesión con su correo anterior.
//
// Uso:
//   node --env-file=.env actualizar_correo.js <correo_anterior> <correo_nuevo>
// Ejemplo:
//   node --env-file=.env actualizar_correo.js viejo@academicos.udg.mx nuevo@academicos.udg.mx
//
// ⚠️  La Service Role Key omite RLS: ejecuta este script solo en tu máquina.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://hsqtqtaijuygrbobccis.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const [, , correoAnteriorArg, correoNuevoArg] = process.argv

if (!SERVICE_KEY) {
  console.error('✗ Falta SUPABASE_SERVICE_KEY en .env.')
  process.exit(1)
}
if (!correoAnteriorArg || !correoNuevoArg) {
  console.error(
    'Uso: node --env-file=.env actualizar_correo.js <correo_anterior> <correo_nuevo>'
  )
  process.exit(1)
}

const correoAnterior = correoAnteriorArg.trim().toLowerCase()
const correoNuevo = correoNuevoArg.trim().toLowerCase()

if (correoAnterior === correoNuevo) {
  console.error('✗ El correo nuevo es igual al anterior; no hay nada que actualizar.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Localizar al profesor por su correo anterior
  const { data: prof, error } = await supabase
    .from('profesores')
    .select('id, nombre, apellidos, user_id')
    .eq('correo', correoAnterior)
    .maybeSingle()

  if (error) {
    console.error('✗ Error al leer profesores:', error.message)
    process.exit(1)
  }
  if (!prof) {
    console.error(`✗ No existe un profesor con el correo ${correoAnterior}.`)
    process.exit(1)
  }

  // 2. Actualizar el correo en Supabase Auth (si tiene cuenta vinculada)
  if (prof.user_id) {
    const { error: errAuth } = await supabase.auth.admin.updateUserById(prof.user_id, {
      email: correoNuevo,
      email_confirm: true, // no requiere que reconfirme el nuevo correo
    })
    if (errAuth) {
      console.error('✗ No se pudo actualizar el correo en Auth:', errAuth.message)
      process.exit(1)
    }
    console.log('✓ Correo actualizado en Supabase Auth.')
  } else {
    console.log('• El profesor no tiene cuenta de Auth vinculada; solo se actualiza la tabla.')
  }

  // 3. Actualizar la tabla profesores (por si el cambio no se hizo desde la app)
  const { error: errTabla } = await supabase
    .from('profesores')
    .update({ correo: correoNuevo })
    .eq('id', prof.id)
  if (errTabla) {
    console.error(
      errTabla.code === '23505'
        ? '✗ Ya existe otro profesor con ese correo.'
        : `✗ No se pudo actualizar la tabla profesores: ${errTabla.message}`
    )
    process.exit(1)
  }

  console.log(
    `✓ ${prof.nombre} ${prof.apellidos}: correo cambiado de ${correoAnterior} a ${correoNuevo}.`
  )
}

main().catch((e) => {
  console.error('✗ Error inesperado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
