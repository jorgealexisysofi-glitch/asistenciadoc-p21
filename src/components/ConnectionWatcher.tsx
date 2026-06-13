import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

/** Avisa con toasts cuando se pierde o recupera la conexión */
export default function ConnectionWatcher() {
  const idRef = useRef<string | null>(null)

  useEffect(() => {
    function offline() {
      idRef.current = toast.loading('Sin conexión. Los registros se sincronizarán al reconectar.', {
        id: 'conexion',
      })
    }
    function online() {
      if (idRef.current) {
        toast.success('Conexión restablecida.', { id: 'conexion' })
        idRef.current = null
      }
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  return null
}
