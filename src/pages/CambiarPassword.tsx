import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'

const MIN_LEN = 8

export default function CambiarPassword() {
  const { profesor, loading, refreshProfesor } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  if (loading) return <Spinner label="Verificando sesión…" />

  // Quien ya tiene contraseña personal no necesita esta pantalla
  if (profesor && !profesor.password_temporal) {
    return <Navigate to="/home" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`)
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setWorking(true)
    // 1. Cambiar la contraseña en Supabase Auth (no requiere código por correo)
    const { error: errAuth } = await supabase.auth.updateUser({ password })
    if (errAuth) {
      setError(
        errAuth.message.toLowerCase().includes('different')
          ? 'La nueva contraseña debe ser distinta a la temporal.'
          : 'No se pudo actualizar la contraseña. Intenta de nuevo.'
      )
      setWorking(false)
      return
    }

    // 2. Marcar la ficha como contraseña ya personalizada
    if (profesor) {
      const { error: errFicha } = await supabase
        .from('profesores')
        .update({ password_temporal: false })
        .eq('id', profesor.id)
      if (errFicha) {
        setError('Tu contraseña cambió, pero hubo un problema al finalizar. Intenta de nuevo.')
        setWorking(false)
        return
      }
    }

    // 3. Refrescar el contexto para evitar volver a esta pantalla, y continuar
    await refreshProfesor()
    toast.success('Contraseña actualizada.')
    navigate('/home', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-fondo">
      <div className="h-2 bg-udeg-naranja" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={72} />
          <h1 className="mt-5 text-2xl font-bold text-udeg-azul">Bienvenido a AsistenciaDoc</h1>
          <p className="mt-1 text-sm text-gray-500">
            Por seguridad debes establecer tu contraseña personal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-gray-700"
            >
              Nueva contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={MIN_LEN}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="confirmar"
              className="mb-1.5 block text-sm font-semibold text-gray-700"
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmar"
              type="password"
              required
              minLength={MIN_LEN}
              autoComplete="new-password"
              placeholder="Repite tu contraseña"
              className="input"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>

          {error && (
            <p
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              role="alert"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={working} className="btn-primary w-full">
            {working ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Si tienes problemas para acceder, acude a Secretaría Académica de la
          Preparatoria 21.
        </p>
      </main>
      <div className="h-2 bg-udeg-azul" />
    </div>
  )
}
