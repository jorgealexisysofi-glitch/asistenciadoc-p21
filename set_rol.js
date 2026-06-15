// set_rol.js
// Promueve o degrada el rol de un profesor SIN depender de Edge Functions:
// usa la Service Role Key para escribir app_metadata.rol y espejar
// profesores.admin (la fuente que lee la interfaz e is_admin()).
//
// Uso:
//   node --env-file=.env set_rol.js <correo> <admin|profesor>
// Ejemplos:
//   node --env-file=.env set_rol.js maria.lopez@academicos.udg.mx admin
//   node --env-file=.env set_rol.js jose.ramirez@academicos.udg.mx profesor
//
// ⚠️  La Service Role Key omite RLS: ejecuta este script solo en tu máquina.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://hsqtqtaijuygrbobccis.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const [, , correoArg, rolArg] = process.argv

if (!SERVICE_KEY) {
  console.error('✗ Falta SUPABASE_SERVICE_KEY en .env.')
  process.exit(1)
}
if (!correoArg || (rolArg !== 'admin' && rolArg !== 'profesor')) {
  console.error('Uso: node --env-file=.env set_rol.js <correo> <admin|profesor>')
  process.exit(1)
}

const correo = correoArg.trim().toLowerCase()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Localizar al profesor y su cuenta vinculada
  const { data: prof, error } = await supabase
    .from('profesores')
    .select('id, nombre, apellidos, user_id')
    .eq('correo', correo)
    .maybeSingle()

  if (error) {
    console.error('✗ Error al leer profesores:', error.message)
    process.exit(1)
  }
  if (!prof) {
    console.error(`✗ No existe un profesor con el correo ${correo}.`)
    process.exit(1)
  }
  if (!prof.user_id) {
    console.error(
      `✗ ${prof.nombre} ${prof.apellidos} no tiene cuenta vinculada (user_id). ` +
        'Crea/invita su cuenta primero.'
    )
    process.exit(1)
  }

  // 2. Escribir app_metadata.rol (fuente que valida RLS)
  const { error: errMeta } = await supabase.auth.admin.updateUserById(prof.user_id, {
    app_metadata: { rol: rolArg },
  })
  if (errMeta) {
    console.error('✗ No se pudo actualizar app_metadata:', errMeta.message)
    process.exit(1)
  }

  // 3. Espejar en profesores.admin para la interfaz
  const { error: errFicha } = await supabase
    .from('profesores')
    .update({ admin: rolArg === 'admin' })
    .eq('id', prof.id)
  if (errFicha) {
    console.error('✗ app_metadata actualizado, pero falló el espejo en profesores:', errFicha.message)
    process.exit(1)
  }

  console.log(
    `✓ ${prof.nombre} ${prof.apellidos} ahora es ${rolArg.toUpperCase()}.\n` +
      '  (El cambio toma efecto al renovar su sesión / próximo login.)'
  )
}

main().catch((e) => {
  console.error('✗ Error inesperado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
