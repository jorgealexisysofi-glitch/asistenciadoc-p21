import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { IconDownload, IconX } from './icons'
import Logo from './Logo'

/** Banner flotante "Instalar app" que aparece si la PWA es instalable */
export default function InstallBanner() {
  const { instalable, instalar, descartar } = useInstallPrompt()

  if (!instalable) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg">
        <Logo size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">Instala AsistenciaDoc</p>
          <p className="truncate text-xs text-gray-500">
            Accede más rápido y úsala sin conexión.
          </p>
        </div>
        <button onClick={() => void instalar()} className="btn-primary !px-4 !py-2 text-xs">
          <IconDownload className="h-4 w-4" />
          Instalar
        </button>
        <button
          onClick={descartar}
          aria-label="Descartar"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
