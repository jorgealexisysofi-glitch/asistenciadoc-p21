import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { esCorreoAdmin, supabase, traducirErrorAuth } from '../lib/supabase'
import type { Profesor, Rol } from '../types'

interface SignInResult {
  error: string | null
  /** Rol resuelto tras el login; útil para redirigir (admin → /admin) */
  rol: Rol | null
}

interface AuthContextValue {
  /** Usuario de Supabase Auth (null sin sesión) */
  user: User | null
  session: Session | null
  /** Ficha vinculada en `profesores` por user_id; null si la cuenta no está vinculada */
  profesor: Profesor | null
  /** 'admin' | 'profesor'; null sin sesión */
  rol: Rol | null
  /** true mientras se resuelve la sesión inicial */
  loading: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  /** Envía el correo de recuperación de contraseña */
  resetPassword: (email: string) => Promise<{ error: string | null }>
  /** Recarga la ficha del profesor en el contexto (p. ej. tras cambiar contraseña) */
  refreshProfesor: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Resuelve el rol del usuario:
 *  1. app_metadata.rol === 'admin' en el JWT (fuente que valida RLS), o
 *  2. campo admin = true en su ficha de `profesores`, o
 *  3. correo del dominio admin configurado (VITE_ADMIN_EMAIL_DOMAIN).
 * En cualquier otro caso es 'profesor'.
 */
function calcularRol(user: User | null, profesor: Profesor | null): Rol | null {
  if (!user) return null
  if (user.app_metadata?.rol === 'admin') return 'admin'
  if (profesor?.admin) return 'admin'
  if (esCorreoAdmin(user.email)) return 'admin'
  return 'profesor'
}

async function fetchProfesor(userId: string): Promise<Profesor | null> {
  const { data } = await supabase
    .from('profesores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as Profesor) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profesor, setProfesor] = useState<Profesor | null>(null)
  const [loading, setLoading] = useState(true)

  const user = session?.user ?? null
  const rol = calcularRol(user, profesor)

  useEffect(() => {
    let active = true

    async function sync(s: Session | null) {
      const p = s ? await fetchProfesor(s.user.id) : null
      if (!active) return
      setSession(s)
      setProfesor(p)
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => sync(s))
      .catch(() => {
        // Supabase sin configurar: la app sigue funcionando (solo login deshabilitado)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void sync(s)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string): Promise<SignInResult> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: traducirErrorAuth(error), rol: null }

      // Cargar la ficha de inmediato para poder redirigir según el rol
      const p = await fetchProfesor(data.user.id)
      setSession(data.session)
      setProfesor(p)
      return { error: null, rol: calcularRol(data.user, p) }
    } catch {
      return {
        error: 'Sin conexión. Verifica tu internet e intenta de nuevo.',
        rol: null,
      }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfesor(null)
  }

  async function resetPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) return { error: traducirErrorAuth(error) }
      return { error: null }
    } catch {
      return { error: 'Sin conexión. Verifica tu internet e intenta de nuevo.' }
    }
  }

  async function refreshProfesor() {
    if (!session) return
    setProfesor(await fetchProfesor(session.user.id))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profesor,
        rol,
        loading,
        signIn,
        signOut,
        resetPassword,
        refreshProfesor,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
