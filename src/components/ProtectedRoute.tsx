import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Spinner from './Spinner'

interface ProtectedRouteProps {
  children: ReactNode
  /**
   * Rol requerido además de la sesión:
   *   'admin'   → solo administradores (escritura).
   *   'monitor' → administradores O usuarios de solo lectura (monitor).
   */
  requireRol?: 'admin' | 'monitor'
  /** Omite la redirección a /cambiar-nip (úsalo en esa misma ruta) */
  skipNipCheck?: boolean
}

export default function ProtectedRoute({
  children,
  requireRol,
  skipNipCheck,
}: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, esMonitor, requiereCambioNip, loading } = useAuth()

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sin sesión → al login
  if (!isAuthenticated) return <Navigate to="/" replace />

  // NIP temporal → forzar cambio antes de cualquier otra ruta
  if (!skipNipCheck && requiereCambioNip) {
    return <Navigate to="/cambiar-nip" replace />
  }

  // Destino de rebote: el monitor no tiene "vista profesor", va al panel.
  const inicio = esMonitor ? '/admin' : '/home'

  // Rutas solo admin: el monitor (o profesor) no entra.
  if (requireRol === 'admin' && !isAdmin) {
    return <Navigate to={inicio} replace />
  }

  // Rutas de monitoreo: admin o monitor.
  if (requireRol === 'monitor' && !isAdmin && !esMonitor) {
    return <Navigate to={inicio} replace />
  }

  return <>{children}</>
}
