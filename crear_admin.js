// crear_admin.js
// Crea la cuenta de Supabase Auth (correo + contraseña) de un profesor y le da
// rol de administrador. Los admins acceden al panel con correo + contraseña
// (Supabase Auth), NO con código + NIP, porque las políticas RLS dependen de
// auth.uid() y app_metadata.
//
// Uso:
//   node --env-file=.env crear_admin.js <correo> <contraseña_temporal>
// Ejemplo:
//   node --env-file=.env crear_admin.js director@academicos.udg.mx Prepa21Admin
//
// El correo debe coincidir con el de un profesor ya existente en la tabla.
//
// ⚠️  La Service Role Key omite RLS: ejecuta este script solo en tu máquina.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://hsqtqtaijuygrbobccis.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const [, , correoArg, passwordArg] = process.argv

if (!SERVICE_KEY) {
  console.error('✗ Falta SUPABASE_SERVICE_KEY en .env.')
  process.exit(1)
}
if (!correoArg || !passwordArg) {
  console.error('Uso: node --env-file=.env crear_admin.js <correo> <contraseña_temporal>')
  process.exit(1)
}

const correo = correoArg.trim().toLowerCase()
const password = passwordArg

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Busca un usuario de Auth por correo recorriendo las páginas de listUsers */
async function buscarUsuarioPorCorreo(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const u = data.users.find((x) => x.email?.toLowerCase() === email)
    if (u) return u
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  // 1. El profesor debe existir en la tabla (se vincula por correo)
  const { data: prof, error: errProf } = await supabase
    .from('profesores')
    .select('id, nombre, apellidos, user_id')
    .eq('correo', correo)
    .maybeSingle()

  if (errProf) {
    console.error('✗ Error al leer profesores:', errProf.message)
    process.exit(1)
  }
  if (!prof) {
    console.error(`✗ No existe un profesor con el correo ${correo}. Créalo primero en el panel.`)
    process.exit(1)
  }

  // 2. Crear la cuenta de Auth (o reutilizar la existente) con rol admin
  let userId
  const { data: creado, error: errCreate } = await supabase.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    app_metadata: { rol: 'admin' },
  })

  if (errCreate) {
    // Si el correo ya tiene cuenta, reutilizarla: fijar contraseña y rol admin
    const existente = await buscarUsuarioPorCorreo(correo)
    if (!existente) {
      console.error('✗ No se pudo crear la cuenta:', errCreate.message)
      process.exit(1)
    }
    userId = existente.id
    const { error: errUpd } = await supabase.auth.admin.updateUserById(userId, {
      password,
      app_metadata: { rol: 'admin' },
    })
    if (errUpd) {
      console.error('✗ No se pudo actualizar la cuenta existente:', errUpd.message)
      process.exit(1)
    }
    console.log('• La cuenta ya existía: se actualizó contraseña y rol admin.')
  } else {
    userId = creado.user.id
    console.log('✓ Cuenta de acceso creada.')
  }

  // 3. Vincular user_id y marcar admin en la ficha del profesor
  const { error: errLink } = await supabase
    .from('profesores')
    .update({ user_id: userId, admin: true })
    .eq('id', prof.id)
  if (errLink) {
    console.error('✗ Cuenta lista, pero no se pudo vincular la ficha:', errLink.message)
    process.exit(1)
  }

  console.log(
    `✓ ${prof.nombre} ${prof.apellidos} ya es administrador.\n` +
      `  Accede en el panel con "Acceso administrativo" usando:\n` +
      `    correo: ${correo}\n` +
      `    contraseña: ${password}\n` +
      '  (Se recomienda que la cambie después de su primer ingreso.)'
  )
}

main().catch((e) => {
  console.error('✗ Error inesperado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
