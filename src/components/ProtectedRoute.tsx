import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

interface ProtectedRouteProps {
  children: ReactNode
  /** Si se indica, además de sesión se exige este rol */
  requireRol?: 'admin'
}

export default function ProtectedRoute({ children, requireRol }: ProtectedRouteProps) {
  const { user, rol, loading } = useAuth()

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sin sesión → al login
  if (!user) return <Navigate to="/" replace />

  // Con sesión pero sin el rol requerido → a su inicio
  if (requireRol === 'admin' && rol !== 'admin') {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
