import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const MIN_LEN = 8

export default function CambiarPasswordAdmin() {
  const { user, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  if (loading) return <Spinner label="Verificando sesión…" />

  // Solo admins con sesión de Supabase Auth: los admins por NIP no aplican aquí
  if (!user) return <Navigate to="/admin" replace />

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
    const { error: errAuth } = await supabase.auth.updateUser({ password })
    setWorking(false)

    if (errAuth) {
      setError(
        errAuth.message.toLowerCase().includes('different')
          ? 'La nueva contraseña debe ser distinta a la actual.'
          : 'No se pudo actualizar la contraseña. Intenta de nuevo.'
      )
      return
    }

    setPassword('')
    setConfirmar('')
    toast.success('Contraseña actualizada correctamente')
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Cambiar contraseña' }]}>
      <h1 className="text-xl font-bold text-gray-900">Cambiar contraseña</h1>
      <p className="mt-1 text-sm text-gray-500">
        Actualiza la contraseña de tu cuenta de administrador ({user.email}).
      </p>

      <form onSubmit={handleSubmit} className="card mt-5 flex max-w-sm flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-700">
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
          <label htmlFor="confirmar" className="mb-1.5 block text-sm font-semibold text-gray-700">
            Confirmar nueva contraseña
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

        <button type="submit" disabled={working} className="btn-primary">
          {working ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AdminLayout>
  )
}
