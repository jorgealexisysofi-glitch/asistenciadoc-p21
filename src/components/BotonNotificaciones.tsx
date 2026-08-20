import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { activarPush, desactivarPush, pushSoportado, suscripcionActual } from '../lib/push'

/** Tarjeta para activar/desactivar los recordatorios push del maestro */
export default function BotonNotificaciones({ profesorId }: { profesorId: string }) {
  const [soportado] = useState(() => pushSoportado())
  const [activo, setActivo] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    if (!soportado) return
    void suscripcionActual().then((s) => setActivo(!!s))
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setBloqueado(true)
    }
  }, [soportado])

  if (!soportado) return null

  async function activar() {
    setTrabajando(true)
    const r = await activarPush(profesorId)
    setTrabajando(false)
    if (r === 'ok') {
      setActivo(true)
      setBloqueado(false)
      toast.success('Recordatorios activados en este dispositivo.')
    } else if (r === 'bloqueado') {
      setBloqueado(true)
      toast.error('El permiso de notificaciones está bloqueado.')
    } else {
      toast.error('No se pudieron activar los recordatorios.')
    }
  }

  async function desactivar() {
    setTrabajando(true)
    await desactivarPush()
    setTrabajando(false)
    setActivo(false)
    toast('Recordatorios desactivados en este dispositivo.', { icon: '🔕' })
  }

  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-800">🔔 Recordatorios</p>
        <p className="text-xs text-gray-500">
          {bloqueado
            ? 'Están bloqueados. Actívalos en los ajustes del navegador/app para este sitio.'
            : activo
              ? 'Recibirás avisos de tus próximas clases, entrada y salida.'
              : 'Activa avisos de tus próximas clases, registro de entrada y de salida.'}
        </p>
      </div>
      {!bloqueado && (
        <button
          onClick={() => void (activo ? desactivar() : activar())}
          disabled={trabajando}
          className={activo ? 'btn-ghost shrink-0' : 'btn-primary shrink-0'}
        >
          {trabajando ? '…' : activo ? 'Desactivar' : 'Activar'}
        </button>
      )}
    </div>
  )
}
