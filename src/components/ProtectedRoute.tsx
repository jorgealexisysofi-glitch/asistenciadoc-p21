import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

interface ProtectedRouteProps {
  children: ReactNode
  /** Si se indica, además de sesión se exige rol admin */
  requireRol?: 'admin'
  /** Omite la redirección a /cambiar-nip (úsalo en esa misma ruta) */
  skipNipCheck?: boolean
}

export default function ProtectedRoute({
  children,
  requireRol,
  skipNipCheck,
}: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, requiereCambioNip, loading } = useAuth()

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sin sesión → al login
  if (!isAuthenticated) return <Navigate to="/" replace />

  // NIP temporal → forzar cambio antes de cualquier otra ruta
  if (!skipNipCheck && requiereCambioNip) {
    return <Navigate to="/cambiar-nip" replace />
  }

  // Con sesión pero sin rol admin → a su inicio
  if (requireRol === 'admin' && !isAdmin) {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
