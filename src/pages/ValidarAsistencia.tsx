import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Layout from '../components/Layout'
import EstadoBadge from '../components/EstadoBadge'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useBeaconDetection } from '../hooks/useBeaconDetection'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import {
  FIRMAR_SALIDA_HABILITADO,
  SALIDA_ANTES_MIN,
  TOLERANCIA_MIN,
  calcularEstado,
  formatHora,
  formatHoraRegistro,
} from '../lib/asistencia'
import {
  encolar,
  sincronizarCola,
  tienePendiente,
  type ItemCola,
} from '../lib/colaOffline'
import { EVENTO_SYNC } from '../components/ConnectionWatcher'
import type { ClaseSalida, HorarioActivo, MetodoDeteccion, RegistroClase } from '../types'

type Resultado = { tipo: 'ok' | 'error' | 'info'; mensaje: string } | null

const BLUEFY_URL = 'https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055'

/** ¿El dispositivo es iPhone/iPad? (iPadOS se hace pasar por Mac → se mira el touch) */
function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const clasico = /iPad|iPhone|iPod/.test(ua)
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return clasico || iPadOS
}

// Bluefy/WebBLE inyectan navigator.bluetooth: si existe, la detección sí funciona,
// así que el aviso solo aplica en iOS SIN Web Bluetooth (Safari/Chrome iOS normales).
const iosSinBluetooth = esIOS() && !('bluetooth' in navigator)

// Caché del HORARIO COMPLETO del maestro: se guarda cada vez que hay internet,
// para que sin conexión la app pueda determinar la clase actual (cualquiera, no
// solo la última vista) y permitir registrar.
const CLAVE_CACHE_HORARIO = 'asistenciadoc:horario-completo'

function guardarCacheCompleto(profesorId: string, horarios: HorarioActivo[]) {
  try {
    localStorage.setItem(CLAVE_CACHE_HORARIO, JSON.stringify({ profesorId, horarios }))
  } catch {
    /* memoria llena: se ignora */
  }
}

/** Clase activa AHORA según el horario completo cacheado (para uso offline) */
function claseActivaDeCache(profesorId: string): HorarioActivo | null {
  try {
    const raw = localStorage.getItem(CLAVE_CACHE_HORARIO)
    if (!raw) return null
    const { profesorId: pid, horarios } = JSON.parse(raw) as {
      profesorId: string
      horarios: HorarioActivo[]
    }
    if (pid !== profesorId) return null
    const dow = new Date().getDay()
    const dia = dow === 0 ? 7 : dow // ISO: 1=Lunes … 7=Domingo
    const ahora = horaActual()
    return (
      horarios.find((h) => h.dia_semana === dia && ahora >= h.hora_inicio && ahora < h.hora_fin) ??
      null
    )
  } catch {
    return null
  }
}

/** Genera un id de cliente para la cola (con respaldo si no hay crypto.randomUUID) */
function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function ValidarAsistencia() {
  const { profesor } = useAuth()
  const [reloj, setReloj] = useState(new Date())
  const [horario, setHorario] = useState<HorarioActivo | null>(null)
  const [registro, setRegistro] = useState<RegistroClase | null>(null)
  const [salida, setSalida] = useState<ClaseSalida | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [savingSalida, setSavingSalida] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)
  // Registros de esta clase pendientes de enviar (guardados sin conexión)
  const [pendEntrada, setPendEntrada] = useState(false)
  const [pendSalida, setPendSalida] = useState(false)

  const profesorId = profesor?.id

  const { beaconDetectado, metodo, scanning, error: errorBeacon, coords, iniciarEscaneo } =
    useBeaconDetection(horario?.beacon_id, horario?.beacon_tipo)

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const cargar = useCallback(async () => {
    if (!profesorId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fecha = hoyISO()
    const { data, error } = await supabase.rpc('get_horario_activo', {
      p_profesor_id: profesorId,
      p_fecha: fecha,
      p_hora: horaActual(),
    })

    // Sin conexión (o error de red): usar la clase cacheada si la app la cargó
    // antes mientras había red, para poder registrar igual.
    if (error) {
      const cache = claseActivaDeCache(profesorId)
      setHorario(cache)
      setSalida(null)
      if (cache) {
        const pend = tienePendiente(cache.horario_id, fecha, 'entrada')
        setPendEntrada(pend)
        setPendSalida(tienePendiente(cache.horario_id, fecha, 'salida'))
        // Si ya se registró offline, mostrarla como registrada (pendiente).
        setRegistro(
          pend ? { id: 'offline', estado: calcularEstado(cache.hora_inicio), hora_registro: '' } : null
        )
      } else {
        setRegistro(null)
      }
      setLoading(false)
      return
    }

    const h = ((data ?? []) as HorarioActivo[])[0] ?? null
    setHorario(h)

    // Con internet: cachear el horario COMPLETO para poder registrar offline
    // en cualquier clase (no solo la que esté activa en este momento).
    const { data: completo } = await supabase.rpc('get_horario_completo', {
      p_profesor_id: profesorId,
    })
    if (completo) guardarCacheCompleto(profesorId, completo as HorarioActivo[])

    if (h) {
      const { data: reg } = await supabase.rpc('get_registro_clase', {
        p_profesor_id: profesorId,
        p_horario_id: h.horario_id,
        p_fecha: fecha,
      })
      setRegistro(((reg ?? []) as RegistroClase[])[0] ?? null)
      setPendEntrada(tienePendiente(h.horario_id, fecha, 'entrada'))
      setPendSalida(tienePendiente(h.horario_id, fecha, 'salida'))
    }

    // Firmar salida (solo si la función está habilitada): clase cuya ventana de
    // salida está abierta ahora, aunque la clase ya haya terminado hace poco.
    if (FIRMAR_SALIDA_HABILITADO) {
      const { data: sal } = await supabase.rpc('get_clase_para_salida', {
        p_profesor_id: profesorId,
        p_fecha: fecha,
        p_hora: horaActual(),
      })
      setSalida(((sal ?? []) as ClaseSalida[])[0] ?? null)
    }
    setLoading(false)
  }, [profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Al montar y al reconectar: sincronizar la cola y refrescar la vista.
  useEffect(() => {
    async function sincronizarYRefrescar() {
      const n = await sincronizarCola()
      if (n > 0) await cargar()
    }
    function alReconectar() {
      void sincronizarYRefrescar()
    }
    if (navigator.onLine) void sincronizarYRefrescar()
    window.addEventListener('online', alReconectar)
    window.addEventListener(EVENTO_SYNC, alReconectar)
    return () => {
      window.removeEventListener('online', alReconectar)
      window.removeEventListener(EVENTO_SYNC, alReconectar)
    }
  }, [cargar])

  /** Guarda el registro en la cola local (sin red) y confirma de forma optimista */
  function guardarOffline(metodoRegistro: MetodoDeteccion, beacon: string | null) {
    if (!horario) return
    const momento = new Date().toISOString()
    const item: ItemCola = {
      id: nuevoId(),
      tipo: 'entrada',
      momento,
      profesor_id: profesorId!,
      horario_id: horario.horario_id,
      fecha: hoyISO(),
      aula_id: horario.aula_id,
      metodo: metodoRegistro,
      beacon,
      lat: coords?.latitud ?? null,
      lon: coords?.longitud ?? null,
      etiqueta: `${horario.materia_nombre} · entrada`,
    }
    encolar(item)
    // Confirmación optimista: mostrar como registrada (pendiente de enviar).
    setRegistro({ id: item.id, estado: calcularEstado(horario.hora_inicio), hora_registro: momento })
    setPendEntrada(true)
    setResultado({
      tipo: 'info',
      mensaje:
        'Sin conexión: tu asistencia se guardó en el teléfono y se enviará sola cuando vuelvas a tener internet.',
    })
    toast('Guardado sin conexión. Se enviará al reconectar.', { icon: '📶' })
  }

  async function registrar(metodoRegistro: MetodoDeteccion, beacon: string | null) {
    if (!profesorId || !horario) return
    setWorking(true)

    // Sin conexión: guardar en la cola local con la hora real.
    if (!navigator.onLine) {
      guardarOffline(metodoRegistro, beacon)
      setWorking(false)
      return
    }

    // RPC SECURITY DEFINER: registra usando profesor_id (sin sesión de Supabase).
    // El estado (presente/tarde) lo calcula el servidor. p_momento null = ahora.
    const { error } = await supabase.rpc('registrar_asistencia', {
      p_profesor_id: profesorId,
      p_horario_id: horario.horario_id,
      p_aula_id: horario.aula_id,
      p_metodo: metodoRegistro,
      p_beacon: beacon,
      p_lat: coords?.latitud ?? null,
      p_lon: coords?.longitud ?? null,
      p_momento: null,
    })
    if (error) {
      // La red pudo caerse a mitad del envío: guardar offline en vez de fallar.
      console.error('[registrar_asistencia] falló, se guarda offline:', error)
      guardarOffline(metodoRegistro, beacon)
    } else {
      setResultado({
        tipo: 'ok',
        mensaje:
          metodoRegistro === 'manual'
            ? 'Asistencia registrada manualmente. ✔'
            : 'Asistencia confirmada con el beacon del aula. ✔',
      })
      toast.success('¡Asistencia registrada!')
      await cargar()
    }
    setWorking(false)
  }

  async function confirmarAsistencia() {
    if (!beaconDetectado || !horario) return
    await registrar(metodo ?? horario.beacon_tipo ?? 'manual', beaconDetectado)
  }

  /** Guarda la salida en la cola local (sin red) */
  function guardarSalidaOffline() {
    if (!salida) return
    const momento = new Date().toISOString()
    encolar({
      id: nuevoId(),
      tipo: 'salida',
      momento,
      profesor_id: profesorId!,
      horario_id: salida.horario_id,
      fecha: hoyISO(),
      etiqueta: `${salida.materia_nombre} · salida`,
    })
    setPendSalida(true)
    setSalida({ ...salida, hora_salida: momento })
    toast('Salida guardada sin conexión. Se enviará al reconectar.', { icon: '📶' })
  }

  async function firmarSalida() {
    if (!profesorId || !salida) return
    setSavingSalida(true)

    if (!navigator.onLine) {
      guardarSalidaOffline()
      setSavingSalida(false)
      return
    }

    const { error } = await supabase.rpc('registrar_salida', {
      p_profesor_id: profesorId,
      p_horario_id: salida.horario_id,
      p_fecha: hoyISO(),
      p_momento: null,
    })
    if (error) {
      // Sin red a mitad del envío: guardar offline.
      guardarSalidaOffline()
    } else {
      toast.success('¡Salida firmada!')
      await cargar()
    }
    setSavingSalida(false)
  }

  const horaTexto = reloj.toLocaleTimeString('es-MX', { hour12: false })

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Validar asistencia</h1>
          {profesor && (
            <p className="mt-0.5 text-sm text-gray-500">
              {profesor.nombre} {profesor.apellidos}
            </p>
          )}
        </div>
        <p className="rounded-xl bg-udeg-azul-light px-3 py-2 font-mono text-sm font-bold tabular-nums text-udeg-azul">
          {horaTexto}
        </p>
      </div>

      {loading ? (
        <Spinner label="Consultando tu horario…" />
      ) : !profesor ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          Tu cuenta aún no está vinculada a una ficha de profesor. Contacta a la
          administración.
        </p>
      ) : !horario ? (
        FIRMAR_SALIDA_HABILITADO && salida ? null : (
          <div className="card mt-5 flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              No tienes clase programada en este momento, por lo que no hay asistencia que
              validar.
            </p>
            <Link to="/home" className="btn-ghost">
              ← Volver al inicio
            </Link>
          </div>
        )
      ) : (
        <>
          {/* Estado de la señal */}
          <section
            className={`card mt-5 border-2 ${
              beaconDetectado
                ? 'border-emerald-200 bg-emerald-50/50'
                : scanning
                  ? 'border-udeg-naranja-light'
                  : 'border-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${
                  beaconDetectado
                    ? 'bg-emerald-500'
                    : scanning
                      ? 'animate-pulse bg-udeg-naranja'
                      : 'bg-gray-300'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">
                  {beaconDetectado
                    ? `Aula detectada: ${horario.aula_nombre}`
                    : scanning
                      ? 'Buscando señal…'
                      : 'Sin señal'}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {beaconDetectado
                    ? `Beacon "${beaconDetectado}" (${metodo === 'wifi' ? 'WiFi' : 'Bluetooth'})`
                    : horario.beacon_id
                      ? `Buscando "${horario.beacon_id}" (${
                          horario.beacon_tipo === 'wifi' ? 'WiFi' : 'Bluetooth'
                        }) · reintento cada 30 s`
                      : 'Esta aula no tiene beacon configurado'}
                </p>
              </div>
            </div>

            {!beaconDetectado &&
              iosSinBluetooth &&
              horario.beacon_tipo === 'bluetooth' && (
                <div className="mt-3 rounded-xl bg-udeg-azul-light px-3 py-3 text-sm text-udeg-azul">
                  <p className="font-semibold">📱 Detectamos que usas iPhone.</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Para la detección automática por Bluetooth necesitas instalar{' '}
                    <span className="font-semibold">Bluefy</span> o{' '}
                    <span className="font-semibold">WebBLE</span> desde el App Store (apps
                    gratuitas) y abrir esta página desde esa app. Mientras tanto, puedes usar
                    el registro manual abajo.
                  </p>
                  <a
                    href={BLUEFY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary mt-3 w-full"
                  >
                    Ver Bluefy en App Store
                  </a>
                </div>
              )}

            {!beaconDetectado && (
              <button
                onClick={() => void iniciarEscaneo()}
                disabled={scanning}
                className="btn-secondary mt-3 w-full"
              >
                {scanning ? 'Escaneando…' : 'Buscar beacon del aula'}
              </button>
            )}

            {errorBeacon && !beaconDetectado && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                {errorBeacon}
              </p>
            )}
          </section>

          {/* Clase en curso */}
          <section className="card mt-4 flex flex-col gap-4">
            <div>
              <p className="text-lg font-bold text-udeg-azul">{horario.materia_nombre}</p>
              <p className="text-sm text-gray-500">
                {horario.aula_nombre}
                {horario.edificio ? ` · ${horario.edificio}` : ''} ·{' '}
                {formatHora(horario.hora_inicio)}–{formatHora(horario.hora_fin)}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Tolerancia: {TOLERANCIA_MIN} min después del inicio; pasada esa hora el
                registro queda como «Tarde».
              </p>
            </div>

            {resultado && (
              <p
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  resultado.tipo === 'ok'
                    ? 'bg-emerald-50 text-emerald-700'
                    : resultado.tipo === 'info'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                }`}
                role="alert"
              >
                {resultado.mensaje}
              </p>
            )}

            {registro ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Tu asistencia de esta clase ya está registrada.
                  </p>
                  <EstadoBadge estado={registro.estado} />
                </div>
                {pendEntrada && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    📶 Guardada sin conexión · pendiente de enviar. Se sincronizará sola al
                    recuperar internet.
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={() => void confirmarAsistencia()}
                disabled={!beaconDetectado || working}
                className="btn-primary"
              >
                {working ? 'Guardando…' : 'Confirmar asistencia'}
              </button>
            )}

            {/* Firmar salida — DESACTIVADO por ahora (ver FIRMAR_SALIDA_HABILITADO) */}
            {!FIRMAR_SALIDA_HABILITADO && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-500">Firmar salida</p>
                  <span className="badge bg-gray-200 text-gray-500">Desactivado</span>
                </div>
                <button
                  type="button"
                  disabled
                  className="btn-secondary mt-2 w-full cursor-not-allowed opacity-60"
                >
                  Firmar salida
                </button>
                <p className="mt-2 text-xs text-gray-400">
                  Se podrá firmar en los últimos {SALIDA_ANTES_MIN} min de la clase. Función
                  desactivada por ahora.
                </p>
              </div>
            )}

            <Link to="/home" className="btn-ghost">
              ← Volver al inicio
            </Link>
          </section>
        </>
      )}

      {/* Tarjeta funcional de salida (solo cuando la función está habilitada) */}
      {!loading && FIRMAR_SALIDA_HABILITADO && salida && (
        <section className="card mt-4 flex flex-col gap-3">
          <div>
            <p className="text-lg font-bold text-udeg-azul">Firmar salida</p>
            <p className="text-sm text-gray-500">
              {salida.materia_nombre} · {formatHora(salida.hora_inicio)}–
              {formatHora(salida.hora_fin)}
            </p>
          </div>
          {salida.hora_salida ? (
            <>
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                Salida firmada a las {formatHoraRegistro(salida.hora_salida)}. ✔
              </p>
              {pendSalida && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  📶 Guardada sin conexión · pendiente de enviar.
                </p>
              )}
            </>
          ) : (
            <button
              onClick={() => void firmarSalida()}
              disabled={savingSalida}
              className="btn-primary"
            >
              {savingSalida ? 'Firmando…' : 'Firmar salida'}
            </button>
          )}
        </section>
      )}
    </Layout>
  )
}
