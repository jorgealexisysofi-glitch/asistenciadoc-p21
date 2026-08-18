import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { contarPendientes, sincronizarCola } from '../lib/colaOffline'

/** Evento que se emite cuando se sincronizan registros offline (para refrescar UI) */
export const EVENTO_SYNC = 'asistencia-sincronizada'

/**
 * Avisa cuando se pierde/recupera la conexión y, al reconectar (o al abrir la
 * app con conexión), reenvía los registros de asistencia guardados sin red.
 */
export default function ConnectionWatcher() {
  const idRef = useRef<string | null>(null)

  useEffect(() => {
    async function sincronizar() {
      if (contarPendientes() === 0) return
      const n = await sincronizarCola()
      if (n > 0) {
        toast.success(
          n === 1
            ? 'Se sincronizó 1 registro guardado sin conexión.'
            : `Se sincronizaron ${n} registros guardados sin conexión.`
        )
        window.dispatchEvent(new CustomEvent(EVENTO_SYNC))
      }
    }

    function offline() {
      idRef.current = toast.loading('Sin conexión. Tus registros se guardarán y se enviarán al reconectar.', {
        id: 'conexion',
      })
    }
    function online() {
      if (idRef.current) {
        toast.success('Conexión restablecida.', { id: 'conexion' })
        idRef.current = null
      }
      void sincronizar()
    }

    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    // Al abrir la app: si hay pendientes y hay red, sincronizar.
    if (navigator.onLine) void sincronizar()

    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  return null
}
