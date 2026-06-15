import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import Spinner from '../components/Spinner'

const NIP_LEN = 4

export default function CambiarNIP() {
  const { profesor, requiereCambioNip, loading, marcarNipCambiado } = useAuth()
  const navigate = useNavigate()
  const [nipActual, setNipActual] = useState('')
  const [nipNuevo, setNipNuevo] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  if (loading) return <Spinner label="Verificando sesión…" />

  // Sin sesión por NIP, o el NIP ya no es temporal → no aplica esta pantalla
  if (!profesor) return <Navigate to="/" replace />
  if (!requiereCambioNip) return <Navigate to="/home" replace />

  const soloDigitos = (v: string) => v.replace(/\D/g, '')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profesor) return

    if (nipNuevo.length !== NIP_LEN) {
      setError(`El nuevo NIP debe tener ${NIP_LEN} dígitos.`)
      return
    }
    if (nipNuevo !== confirmar) {
      setError('El nuevo NIP y su confirmación no coinciden.')
      return
    }
    if (nipNuevo === nipActual) {
      setError('El nuevo NIP debe ser distinto al actual.')
      return
    }

    setWorking(true)
    const { data, error: errRpc } = await supabase.rpc('cambiar_nip', {
      p_profesor_id: profesor.id,
      p_nip_actual: nipActual,
      p_nip_nuevo: nipNuevo,
    })
    setWorking(false)

    if (errRpc) {
      setError('No se pudo cambiar el NIP. Intenta de nuevo.')
      return
    }
    if (data !== true) {
      setError('El NIP actual es incorrecto.')
      return
    }

    marcarNipCambiado()
    toast.success('NIP actualizado correctamente')
    navigate('/home', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-fondo">
      <div className="h-2 bg-udeg-naranja" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={72} />
          <h1 className="mt-5 text-2xl font-bold text-udeg-azul">Cambia tu NIP</h1>
          <p className="mt-1 text-sm text-gray-500">
            Por seguridad debes establecer tu NIP personal de 4 dígitos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          {(
            [
              ['actual', 'NIP actual', nipActual, setNipActual],
              ['nuevo', 'Nuevo NIP', nipNuevo, setNipNuevo],
              ['confirmar', 'Confirmar nuevo NIP', confirmar, setConfirmar],
            ] as const
          ).map(([id, etiqueta, valor, set]) => (
            <div key={id}>
              <label htmlFor={`nip-${id}`} className="mb-1.5 block text-sm font-semibold text-gray-700">
                {etiqueta}
              </label>
              <input
                id={`nip-${id}`}
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
                placeholder="••••"
                className="input text-center text-lg font-bold tracking-[0.5em]"
                value={valor}
                onChange={(e) => set(soloDigitos(e.target.value))}
              />
            </div>
          ))}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={working} className="btn-primary w-full">
            {working ? 'Guardando…' : 'Guardar NIP'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Si olvidaste tu NIP acude a Secretaría Académica.
        </p>
      </main>
      <div className="h-2 bg-udeg-azul" />
    </div>
  )
}
