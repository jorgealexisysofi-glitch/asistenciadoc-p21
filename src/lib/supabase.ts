import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[AsistenciaDoc] Supabase no está configurado. Copia .env.example a .env y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
  )
}

// Valores placeholder para que la app arranque aunque falte el .env.
// La sesión se persiste en localStorage automáticamente (persistSession: true por defecto).
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key'
)

/**
 * Dominio de correo cuyos usuarios reciben rol admin en la UI (opcional).
 * Ej.: VITE_ADMIN_EMAIL_DOMAIN=admin.udg.mx → juan@admin.udg.mx es admin.
 * Nota: esto solo afecta la interfaz; el acceso real a los datos lo decide
 * RLS en la base (app_metadata.rol o profesores.admin).
 */
const ADMIN_EMAIL_DOMAIN = (import.meta.env.VITE_ADMIN_EMAIL_DOMAIN as string | undefined)
  ?.trim()
  .toLowerCase()

export function esCorreoAdmin(email: string | undefined): boolean {
  if (!email || !ADMIN_EMAIL_DOMAIN) return false
  return email.toLowerCase().endsWith(`@${ADMIN_EMAIL_DOMAIN}`)
}

/** Traduce errores de Supabase Auth a mensajes en español para el usuario */
export function traducirErrorAuth(error: { message: string; status?: number }): string {
  const msg = error.message.toLowerCase()
  if (msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (msg.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || error.status === 0) {
    return 'Sin conexión. Verifica tu internet e intenta de nuevo.'
  }
  if (msg.includes('too many requests') || error.status === 429) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }
  if (msg.includes('placeholder.supabase.co')) {
    return 'El sistema no está configurado. Contacta a la administración.'
  }
  return 'Ocurrió un error al iniciar sesión. Intenta de nuevo.'
}

/** Fecha local de hoy en formato YYYY-MM-DD */
export function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Hora local actual en formato HH:MM:SS (apta como `time` para la RPC) */
export function horaActual(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
