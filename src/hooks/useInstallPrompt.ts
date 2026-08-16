import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Expone el prompt de instalación de la PWA.
 * `instalable` es true si el navegador disparó beforeinstallprompt y la app no
 * está instalada. Descartar el banner solo lo oculta durante la sesión actual:
 * vuelve a aparecer en la siguiente visita/recarga mientras no se instale.
 */
export function useInstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const [oculto, setOculto] = useState(false)

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
    // Solo se oculta en esta sesión; reaparece en la próxima carga
    setOculto(true)
  }

  return {
    instalable: Boolean(evento) && !oculto && !yaInstalada,
    instalar,
    descartar,
  }
}
