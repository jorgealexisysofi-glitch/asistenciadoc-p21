import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'

type Aviso = { tipo: 'error' | 'ok'; mensaje: string } | null

export default function Login() {
  const { user, rol, loading, signIn, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sesión activa: directo a su pantalla según rol
  if (user) return <Navigate to={rol === 'admin' ? '/admin' : '/home'} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    setSubmitting(true)
    const { error, rol: rolLogin } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) {
      setAviso({ tipo: 'error', mensaje: error })
      return
    }
    navigate(rolLogin === 'admin' ? '/admin' : '/home', { replace: true })
  }

  async function handleResetPassword() {
    const correo = email.trim()
    if (!correo) {
      setAviso({
        tipo: 'error',
        mensaje: 'Escribe tu correo institucional arriba y vuelve a tocar el enlace.',
      })
      return
    }
    setAviso(null)
    setSendingReset(true)
    const { error } = await resetPassword(correo)
    setSendingReset(false)
    setAviso(
      error
        ? { tipo: 'error', mensaje: error }
        : {
            tipo: 'ok',
            mensaje: `Si ${correo} está registrado, recibirás un correo para restablecer tu contraseña.`,
          }
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-fondo">
      <div className="h-2 bg-udeg-naranja" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={88} />
          <h1 className="mt-5 text-2xl font-bold text-udeg-azul">
            Sistema de Asistencia Docente
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Preparatoria 21 · Universidad de Guadalajara
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Correo institucional
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="nombre@academicos.udg.mx"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {aviso && (
            <p
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                aviso.tipo === 'ok'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
              role="alert"
            >
              {aviso.mensaje}
            </p>
          )}

          {!isSupabaseConfigured && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Supabase no está configurado. Copia <code>.env.example</code> a{' '}
              <code>.env</code> con tus credenciales para habilitar el acceso.
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
            )}
            {submitting ? 'Validando…' : 'Iniciar sesión'}
          </button>

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={sendingReset}
            className="text-center text-sm font-semibold text-udeg-azul hover:underline disabled:opacity-50"
          >
            {sendingReset ? 'Enviando correo…' : '¿Olvidaste tu contraseña?'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Acceso exclusivo para personal docente y administrativo.
        </p>
      </main>
      <div className="h-2 bg-udeg-azul" />
    </div>
  )
}
