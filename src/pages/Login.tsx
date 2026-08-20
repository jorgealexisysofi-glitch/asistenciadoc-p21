import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'

export default function Login() {
  const { isAuthenticated, isAdmin, esMonitor, requiereCambioNip, loading, signIn, signInAdmin } =
    useAuth()
  const navigate = useNavigate()

  const [modoAdmin, setModoAdmin] = useState(false)
  // Login por NIP
  const [numeroEmpleado, setNumeroEmpleado] = useState('')
  const [nip, setNip] = useState('')
  // Login admin (Supabase Auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Spinner label="Verificando sesión…" />
  if (isAuthenticated) {
    const destino = requiereCambioNip
      ? '/cambiar-nip'
      : isAdmin || esMonitor
        ? '/admin'
        : '/home'
    return <Navigate to={destino} replace />
  }

  async function handleNip(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err, nipTemporal, isAdmin: esAdmin } = await signIn(numeroEmpleado, nip)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    navigate(nipTemporal ? '/cambiar-nip' : esAdmin ? '/admin' : '/home', { replace: true })
  }

  async function handleAdmin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await signInAdmin(email.trim(), password)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    navigate('/admin', { replace: true })
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

        {modoAdmin ? (
          <form onSubmit={handleAdmin} className="card flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">
                Correo del administrador
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@academicos.udg.mx"
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
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Validando…' : 'Entrar como administrador'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModoAdmin(false)
                setError(null)
              }}
              className="text-center text-sm font-semibold text-udeg-azul hover:underline"
            >
              ← Acceso para profesores
            </button>
          </form>
        ) : (
          <form onSubmit={handleNip} className="card flex flex-col gap-4">
            <div>
              <label htmlFor="numero" className="mb-1.5 block text-sm font-semibold text-gray-700">
                Código
              </label>
              <input
                id="numero"
                type="text"
                required
                autoComplete="username"
                placeholder="Ingresa tu código"
                className="input"
                value={numeroEmpleado}
                onChange={(e) => setNumeroEmpleado(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="nip" className="mb-1.5 block text-sm font-semibold text-gray-700">
                PIN
              </label>
              <input
                id="nip"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
                placeholder="Ingresa tu PIN"
                className="input"
                value={nip}
                onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Validando…' : 'Iniciar sesión'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModoAdmin(true)
                setError(null)
              }}
              className="text-center text-sm font-semibold text-udeg-azul hover:underline"
            >
              Acceso administrativo
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          Acceso exclusivo para personal docente y administrativo.
        </p>
      </main>
      <div className="h-2 bg-udeg-azul" />
    </div>
  )
}
