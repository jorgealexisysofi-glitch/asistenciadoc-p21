// invitar_profesores.js
// Crea cuentas de Supabase Auth con una contraseña temporal compartida, vincula
// el user_id con la ficha en `profesores` y genera un CSV con las credenciales.
//
// Uso:
//   node --env-file=.env invitar_profesores.js                  → todas las
//       cuentas pendientes (profesores con user_id = null)
//   node --env-file=.env invitar_profesores.js correo@dominio   → solo esa cuenta
// (o exporta SUPABASE_SERVICE_KEY en el entorno antes de ejecutar)
//
// ⚠️  La Service Role Key omite RLS: ejecuta este script solo en tu máquina,
//     nunca en el navegador ni lo subas al repositorio.
// ⚠️  credenciales_temporales.csv contiene contraseñas: trátalo como secreto,
//     entrégalo por un canal seguro y bórralo cuando los profesores cambien su
//     contraseña.

import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://hsqtqtaijuygrbobccis.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const TEMP_PASSWORD = 'Prepa21@2026'
const CSV_PATH = 'credenciales_temporales.csv'
const PAUSA_MS = 500

if (!SERVICE_KEY) {
  console.error(
    '✗ Falta SUPABASE_SERVICE_KEY. Define la variable en .env y ejecuta:\n' +
      '    node --env-file=.env invitar_profesores.js'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Escapa un campo para CSV (comillas dobles + envoltura) */
const csvCampo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

async function main() {
  const correoArg = process.argv[2]?.trim().toLowerCase()

  // 1. Profesores objetivo: un correo concreto, o todas las cuentas pendientes
  let query = supabase
    .from('profesores')
    .select('id, correo, nombre, apellidos, user_id')
    .order('apellidos', { ascending: true })
  query = correoArg ? query.eq('correo', correoArg) : query.is('user_id', null)

  const { data: profesores, error } = await query

  if (error) {
    console.error('✗ No se pudo leer la tabla profesores:', error.message)
    process.exit(1)
  }

  if (!profesores?.length) {
    console.log(
      correoArg
        ? `No existe un profesor con el correo ${correoArg}.`
        : 'No hay cuentas pendientes por crear (todos tienen user_id).'
    )
    return
  }

  console.log(`Procesando ${profesores.length} profesor(es)…\n`)

  let exitosos = 0
  let fallidos = 0
  let omitidos = 0
  // Filas para el CSV de credenciales (solo cuentas creadas correctamente)
  const credenciales = []

  for (const prof of profesores) {
    const nombreCompleto = `${prof.nombre} ${prof.apellidos}`
    const etiqueta = `${prof.apellidos}, ${prof.nombre} <${prof.correo}>`

    // Ya tiene cuenta vinculada (relevante al pasar un correo concreto)
    if (prof.user_id) {
      console.log(`• ${etiqueta} ya tiene cuenta; se omite.`)
      omitidos++
      continue
    }

    try {
      // 2. Crear la cuenta con contraseña temporal y correo ya confirmado
      const { data: creado, error: errCreate } = await supabase.auth.admin.createUser({
        email: prof.correo,
        password: TEMP_PASSWORD,
        email_confirm: true,
      })
      if (errCreate) throw new Error(errCreate.message)

      // 3. Vincular el user_id con la ficha del profesor
      const { error: errLink } = await supabase
        .from('profesores')
        .update({ user_id: creado.user.id })
        .eq('correo', prof.correo)
      if (errLink) throw new Error(`cuenta creada pero no se vinculó: ${errLink.message}`)

      credenciales.push({ nombre: nombreCompleto, correo: prof.correo })
      console.log(`✓ ${etiqueta}`)
      exitosos++
    } catch (e) {
      console.log(`✗ ${etiqueta} — ${e instanceof Error ? e.message : String(e)}`)
      fallidos++
    }

    // 4. Pausa entre operaciones para no saturar la API
    await dormir(PAUSA_MS)
  }

  // 5. Generar el CSV de credenciales temporales
  if (credenciales.length) {
    const filas = [
      ['nombre', 'correo', 'contraseña_temporal'],
      ...credenciales.map((c) => [c.nombre, c.correo, TEMP_PASSWORD]),
    ]
    // BOM UTF-8 para que Excel muestre bien los acentos
    const csv = '﻿' + filas.map((f) => f.map(csvCampo).join(',')).join('\r\n')
    writeFileSync(CSV_PATH, csv, 'utf8')
    console.log(`\n📄 Credenciales escritas en ${CSV_PATH} (${credenciales.length} cuenta(s)).`)
  }

  console.log(
    `\nResumen: ${exitosos} creada(s), ${omitidos} omitida(s), ${fallidos} fallida(s) de ${profesores.length}.`
  )
  process.exit(fallidos > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('✗ Error inesperado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
