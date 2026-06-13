import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const OCULTAR_KEY = 'asistenciadoc:install-dismissed'

/**
 * Expone el prompt de instalación de la PWA.
 * `instalable` es true solo si el navegador disparó beforeinstallprompt,
 * la app no está ya instalada y el usuario no descartó el banner antes.
 */
export function useInstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [oculto, setOculto] = useState(
    () => localStorage.getItem(OCULTAR_KEY) === '1'
  )

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setEvento(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const yaInstalada =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
  }

  function descartar() {
    localStorage.setItem(OCULTAR_KEY, '1')
    setOculto(true)
  }

  return {
    instalable: Boolean(evento) && !oculto && !yaInstalada,
    instalar,
    descartar,
  }
}
