import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

interface ProtectedRouteProps {
  children: ReactNode
  /** Si se indica, además de sesión se exige este rol */
  requireRol?: 'admin'
  /** Omite la redirección a /cambiar-password (úsalo en esa misma ruta) */
  skipPasswordCheck?: boolean
}

export default function ProtectedRoute({
  children,
  requireRol,
  skipPasswordCheck,
}: ProtectedRouteProps) {
  const { user, profesor, rol, loading } = useAuth()

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sin sesión → al login
  if (!user) return <Navigate to="/" replace />

  // Contraseña temporal → forzar cambio antes de cualquier otra ruta
  if (!skipPasswordCheck && profesor?.password_temporal) {
    return <Navigate to="/cambiar-password" replace />
  }

  // Con sesión pero sin el rol requerido → a su inicio
  if (requireRol === 'admin' && rol !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
