import { useCallback, useEffect, useRef, useState } from 'react'
import type { BeaconTipo } from '../types'

/** Reintento automático mientras la página está visible */
const INTERVALO_ESCANEO_MS = 30_000
/** Tiempo máximo escuchando anuncios BLE de un dispositivo ya autorizado */
const ESPERA_ANUNCIO_MS = 8_000

// --- Tipos mínimos de Web Bluetooth (no están en lib.dom estándar) ----------
interface BluetoothDeviceLike {
  name?: string
  watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void>
  addEventListener?: (
    type: 'advertisementreceived',
    listener: () => void,
    options?: { once?: boolean }
  ) => void
}

interface BluetoothRequestOptions {
  filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>
  acceptAllDevices?: boolean
  optionalServices?: string[]
}

interface BluetoothLike {
  requestDevice(options: BluetoothRequestOptions): Promise<BluetoothDeviceLike>
  getDevices?: () => Promise<BluetoothDeviceLike[]>
}

type NavigatorBT = Navigator & { bluetooth?: BluetoothLike }

/**
 * El nombre que anuncia el ESP32 coincide con el beacon configurado.
 * Tolerante: ignora mayúsculas/espacios y acepta prefijos (algunos ESP32
 * añaden o recortan caracteres al nombre anunciado).
 */
function nombreCoincide(nombre: string | undefined, beaconId: string): boolean {
  if (!nombre) return false
  const a = nombre.trim().toLowerCase()
  const b = beaconId.trim().toLowerCase()
  return a === b || a.startsWith(b) || b.startsWith(a)
}

export interface Coordenadas {
  latitud: number
  longitud: number
}

export interface BeaconDetection {
  /** Identificador del beacon detectado (null si no hay señal) */
  beaconDetectado: string | null
  /** Cómo se detectó: 'bluetooth' (no hay API web para escanear WiFi) */
  metodo: BeaconTipo | null
  scanning: boolean
  error: string | null
  /** Posición del dispositivo al solicitar permiso de geolocalización */
  coords: Coordenadas | null
  /** Escaneo manual; debe llamarse desde un gesto del usuario (click) */
  iniciarEscaneo: () => Promise<void>
}

/**
 * Detecta el beacon ESP32 del aula.
 *
 * - Bluetooth: `iniciarEscaneo()` abre el selector del navegador filtrado por el
 *   nombre del beacon (el selector solo lista dispositivos que están anunciando,
 *   así que elegirlo implica presencia física). El reintento automático cada 30 s
 *   usa `getDevices()` + `watchAdvertisements()` (sin gesto) para beacons ya
 *   autorizados en una visita anterior.
 * - WiFi: los navegadores no exponen API para escanear redes; se reporta como no
 *   disponible y la página ofrece el registro manual.
 */
export function useBeaconDetection(
  beaconId: string | null | undefined,
  beaconTipo: BeaconTipo | null | undefined
): BeaconDetection {
  const [beaconDetectado, setBeaconDetectado] = useState<string | null>(null)
  const [metodo, setMetodo] = useState<BeaconTipo | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<Coordenadas | null>(null)

  // Evita escaneos solapados entre el intervalo y el botón manual
  const ocupadoRef = useRef(false)
  const detectadoRef = useRef(false)

  // 1. Permiso de geolocalización al montar (la posición acompaña al registro)
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => {
        // Permiso denegado o sin señal GPS: el registro se guarda sin coordenadas
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    )
  }, [])

  const marcarDetectado = useCallback((nombre: string) => {
    detectadoRef.current = true
    setBeaconDetectado(nombre)
    setMetodo('bluetooth')
    setError(null)
  }, [])

  // Escaneo sin gesto: solo funciona con beacons autorizados previamente
  const escaneoSilencioso = useCallback(async () => {
    if (!beaconId || beaconTipo !== 'bluetooth') return
    const bt = (navigator as NavigatorBT).bluetooth
    if (!bt?.getDevices || ocupadoRef.current || detectadoRef.current) return

    ocupadoRef.current = true
    setScanning(true)
    try {
      const dispositivos = await bt.getDevices()
      const objetivo = dispositivos.find((d) => nombreCoincide(d.name, beaconId))
      if (!objetivo) return

      if (!objetivo.watchAdvertisements || !objetivo.addEventListener) {
        // Navegador sin watchAdvertisements: autorizado previamente cuenta como detección
        marcarDetectado(objetivo.name ?? beaconId)
        return
      }

      // Confirmar cercanía real escuchando sus anuncios BLE unos segundos
      const cerca = await new Promise<boolean>((resolve) => {
        const ctrl = new AbortController()
        const timer = setTimeout(() => {
          ctrl.abort()
          resolve(false)
        }, ESPERA_ANUNCIO_MS)
        objetivo.addEventListener!(
          'advertisementreceived',
          () => {
            clearTimeout(timer)
            ctrl.abort()
            resolve(true)
          },
          { once: true }
        )
        objetivo.watchAdvertisements!({ signal: ctrl.signal }).catch(() => {
          clearTimeout(timer)
          resolve(false)
        })
      })
      if (cerca) marcarDetectado(objetivo.name ?? beaconId)
    } catch {
      // getDevices puede fallar por permisos/flags: se reintenta en el siguiente ciclo
    } finally {
      ocupadoRef.current = false
      setScanning(false)
    }
  }, [beaconId, beaconTipo, marcarDetectado])

  // Escaneo manual (requiere gesto del usuario)
  const iniciarEscaneo = useCallback(async () => {
    if (!beaconId) {
      setError('El aula no tiene beacon configurado. Usa el registro manual.')
      return
    }

    if (beaconTipo === 'wifi') {
      setError(
        `Los navegadores no permiten escanear redes WiFi. Verifica que la red "${beaconId}" sea visible en tu teléfono y registra manualmente.`
      )
      return
    }

    const bt = (navigator as NavigatorBT).bluetooth
    if (!bt) {
      setError(
        'Este navegador no soporta Bluetooth (usa Chrome o Edge en Android). Puedes registrar manualmente.'
      )
      return
    }

    if (ocupadoRef.current) return
    ocupadoRef.current = true
    setScanning(true)
    setError(null)
    try {
      // acceptAllDevices: el selector muestra TODOS los dispositivos BLE cercanos
      // (incluido el ESP32). Un filtro por `name` exacto ocultaba el beacon si su
      // nombre anunciado no coincidía carácter por carácter. La pertenencia al
      // aula se verifica por nombre DESPUÉS de que el usuario lo elige.
      const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: [] })
      if (!nombreCoincide(device.name, beaconId)) {
        setError(
          `Seleccionaste «${device.name ?? 'dispositivo sin nombre'}», que no es el beacon de esta aula (se espera «${beaconId}»). Elige el dispositivo correcto o avisa a la administración para verificar el nombre del ESP32.`
        )
        return
      }
      marcarDetectado(device.name ?? beaconId)
    } catch (e) {
      // Cancelado por el usuario o beacon fuera de alcance
      const cancelado = e instanceof DOMException && e.name === 'NotFoundError'
      setError(
        cancelado
          ? 'No se seleccionó ningún dispositivo. Acércate al aula e intenta de nuevo, o registra manualmente.'
          : 'No se pudo escanear Bluetooth. Intenta de nuevo o registra manualmente.'
      )
    } finally {
      ocupadoRef.current = false
      setScanning(false)
    }
  }, [beaconId, beaconTipo, marcarDetectado])

  // 2. Reintento automático cada 30 s mientras la pestaña está visible
  useEffect(() => {
    detectadoRef.current = false
    setBeaconDetectado(null)
    setMetodo(null)
    if (!beaconId || beaconTipo !== 'bluetooth') return

    void escaneoSilencioso()
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible' && !detectadoRef.current) {
        void escaneoSilencioso()
      }
    }, INTERVALO_ESCANEO_MS)

    return () => clearInterval(intervalo)
  }, [beaconId, beaconTipo, escaneoSilencioso])

  return { beaconDetectado, metodo, scanning, error, coords, iniciarEscaneo }
}
