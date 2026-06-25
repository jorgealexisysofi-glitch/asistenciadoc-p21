import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { esCorreoAdmin, supabase, traducirErrorAuth } from '../lib/supabase'
import type { Profesor, SesionProfesor } from '../types'

const SESION_KEY = 'asistenciadoc:sesion'

interface SignInResult {
  error: string | null
  /** Datos útiles para redirigir tras el login por NIP */
  nipTemporal: boolean
  isAdmin: boolean
}

interface AuthContextValue {
  /** Profesor autenticado (por NIP, o el admin con ficha vía Supabase Auth) */
  profesor: SesionProfesor | null
  /** Usuario de Supabase Auth (solo el admin) */
  user: User | null
  /** Hay una sesión de Supabase Auth activa (correo + contraseña) */
  esSesionSupabase: boolean
  /** Hay alguna sesión activa (NIP o Supabase) */
  isAuthenticated: boolean
  isAdmin: boolean
  /** El profesor entró por NIP y debe cambiarlo antes de continuar */
  requiereCambioNip: boolean
  loading: boolean
  /** Login de profesor por número de empleado + NIP */
  signIn: (numeroEmpleado: string, nip: string) => Promise<SignInResult>
  /** Login del administrador con Supabase Auth (correo + contraseña) */
  signInAdmin: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Marca el NIP como ya cambiado en la sesión local */
  marcarNipCambiado: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function leerSesionLocal(): SesionProfesor | null {
  try {
    const raw = localStorage.getItem(SESION_KEY)
    return raw ? (JSON.parse(raw) as SesionProfesor) : null
  } catch {
    return null
  }
}

/** Ficha del admin vinculada a su usuario de Supabase Auth (si existe) */
async function fetchProfesorAdmin(userId: string): Promise<Profesor | null> {
  const { data } = await supabase
    .from('profesores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as Profesor) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<SesionProfesor | null>(() => leerSesionLocal())
  const [session, setSession] = useState<Session | null>(null)
  const [adminProfesor, setAdminProfesor] = useState<Profesor | null>(null)
  const [loading, setLoading] = useState(true)

  const user = session?.user ?? null

  // Admin vía Supabase Auth: por app_metadata.rol, ficha admin o dominio de correo
  const supabaseEsAdmin =
    user != null &&
    (user.app_metadata?.rol === 'admin' ||
      adminProfesor?.admin === true ||
      esCorreoAdmin(user.email))

  const isAdmin = local?.admin === true || supabaseEsAdmin
  const esSesionSupabase = session != null
  const isAuthenticated = local != null || session != null
  const requiereCambioNip = local?.nip_temporal === true

  // Profesor expuesto: la sesión por NIP, o el admin con ficha de Supabase
  const profesor: SesionProfesor | null = local
    ? local
    : adminProfesor
      ? {
          id: adminProfesor.id,
          nombre: adminProfesor.nombre,
          apellidos: adminProfesor.apellidos,
          admin: adminProfesor.admin,
          nip_temporal: false,
        }
      : null

  // Resolver la sesión de Supabase Auth (solo afecta al admin)
  useEffect(() => {
    let activo = true

    async function sync(s: Session | null) {
      const p = s ? await fetchProfesorAdmin(s.user.id) : null
      if (!activo) return
      setSession(s)
      setAdminProfesor(p)
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => sync(s))
      .catch(() => {})
      .finally(() => {
        if (activo) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void sync(s)
    })

    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(numeroEmpleado: string, nip: string): Promise<SignInResult> {
    try {
      const { data, error } = await supabase.rpc('verificar_nip', {
        p_numero_empleado: numeroEmpleado.trim(),
        p_nip: nip.trim(),
      })
      if (error) {
        return { error: 'No se pudo iniciar sesión. Intenta de nuevo.', nipTemporal: false, isAdmin: false }
      }
      const fila = ((data ?? []) as SesionProfesor[])[0]
      if (!fila) {
        return { error: 'Número de empleado o NIP incorrecto', nipTemporal: false, isAdmin: false }
      }
      const ses: SesionProfesor = {
        id: fila.id,
        nombre: fila.nombre,
        apellidos: fila.apellidos,
        admin: fila.admin,
        nip_temporal: fila.nip_temporal,
      }
      localStorage.setItem(SESION_KEY, JSON.stringify(ses))
      setLocal(ses)
      return { error: null, nipTemporal: ses.nip_temporal, isAdmin: ses.admin }
    } catch {
      return {
        error: 'Sin conexión. Verifica tu internet e intenta de nuevo.',
        nipTemporal: false,
        isAdmin: false,
      }
    }
  }

  async function signInAdmin(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: traducirErrorAuth(error) }
      return { error: null }
    } catch {
      return { error: 'Sin conexión. Verifica tu internet e intenta de nuevo.' }
    }
  }

  async function signOut() {
    localStorage.removeItem(SESION_KEY)
    setLocal(null)
    if (session) await supabase.auth.signOut()
    setSession(null)
    setAdminProfesor(null)
  }

  function marcarNipCambiado() {
    setLocal((prev) => {
      if (!prev) return prev
      const actualizado = { ...prev, nip_temporal: false }
      localStorage.setItem(SESION_KEY, JSON.stringify(actualizado))
      return actualizado
    })
  }

  return (
    <AuthContext.Provider
      value={{
        profesor,
        user,
        esSesionSupabase,
        isAuthenticated,
        isAdmin,
        requiereCambioNip,
        loading,
        signIn,
        signInAdmin,
        signOut,
        marcarNipCambiado,
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
