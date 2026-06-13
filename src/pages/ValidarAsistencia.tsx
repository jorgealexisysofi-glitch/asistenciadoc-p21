import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Layout from '../components/Layout'
import EstadoBadge from '../components/EstadoBadge'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useBeaconDetection } from '../hooks/useBeaconDetection'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import { calcularEstado, formatHora, TOLERANCIA_MIN } from '../lib/asistencia'
import type { HorarioActivo, MetodoDeteccion, RegistroAsistencia } from '../types'

type Resultado = { tipo: 'ok' | 'error' | 'info'; mensaje: string } | null

export default function ValidarAsistencia() {
  const { profesor } = useAuth()
  const [reloj, setReloj] = useState(new Date())
  const [horario, setHorario] = useState<HorarioActivo | null>(null)
  const [registro, setRegistro] = useState<RegistroAsistencia | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)
  const [mostrarPin, setMostrarPin] = useState(false)
  const [pin, setPin] = useState('')

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
    const { data, error } = await supabase.rpc('get_horario_activo', {
      p_profesor_id: profesorId,
      p_fecha: hoyISO(),
      p_hora: horaActual(),
    })
    if (error) {
      setResultado({ tipo: 'error', mensaje: 'No se pudo consultar tu horario.' })
      setLoading(false)
      return
    }
    const h = ((data ?? []) as HorarioActivo[])[0] ?? null
    setHorario(h)

    if (h) {
      const { data: reg } = await supabase
        .from('registros_asistencia')
        .select('*')
        .eq('horario_id', h.horario_id)
        .eq('fecha', hoyISO())
        .maybeSingle()
      setRegistro((reg as RegistroAsistencia) ?? null)
    }
    setLoading(false)
  }, [profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function registrar(metodoRegistro: MetodoDeteccion, beacon: string | null) {
    if (!profesorId || !horario) return
    setWorking(true)

    const payload = {
      horario_id: horario.horario_id,
      profesor_id: profesorId,
      aula_id: horario.aula_id,
      fecha: hoyISO(),
      metodo_deteccion: metodoRegistro,
      beacon_detectado: beacon,
      estado: calcularEstado(horario.hora_inicio),
      latitud: coords?.latitud ?? null,
      longitud: coords?.longitud ?? null,
    }

    // Sin conexión: el service worker encola el POST (Background Sync) y lo
    // reenvía al volver la red. Confirmamos de forma optimista.
    if (!navigator.onLine) {
      void supabase.from('registros_asistencia').insert(payload)
      setResultado({
        tipo: 'info',
        mensaje:
          'Sin conexión: tu asistencia se guardó y se sincronizará automáticamente al reconectar.',
      })
      toast('Guardado sin conexión. Se sincronizará al reconectar.', { icon: '📶' })
      setMostrarPin(false)
      setPin('')
      setWorking(false)
      return
    }

    const { error } = await supabase.from('registros_asistencia').insert(payload)
    if (error) {
      setResultado({
        tipo: 'error',
        mensaje: 'No se pudo guardar el registro. Intenta de nuevo.',
      })
      toast.error('No se pudo registrar la asistencia.')
    } else {
      setResultado({
        tipo: 'ok',
        mensaje:
          metodoRegistro === 'manual'
            ? 'Asistencia registrada manualmente. ✔'
            : 'Asistencia confirmada con el beacon del aula. ✔',
      })
      toast.success('¡Asistencia registrada!')
      setMostrarPin(false)
      setPin('')
      await cargar()
    }
    setWorking(false)
  }

  async function confirmarAsistencia() {
    if (!beaconDetectado || !horario) return
    await registrar(metodo ?? horario.beacon_tipo ?? 'manual', beaconDetectado)
  }

  async function confirmarManual(e: FormEvent) {
    e.preventDefault()
    if (!profesor) return
    if (!profesor.pin) {
      setResultado({
        tipo: 'error',
        mensaje: 'No tienes PIN asignado. Solicítalo a la administración.',
      })
      return
    }
    if (pin !== profesor.pin) {
      setResultado({ tipo: 'error', mensaje: 'PIN incorrecto. Verifica e intenta de nuevo.' })
      return
    }
    setResultado(null)
    await registrar('manual', null)
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
        <div className="card mt-5 flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            No tienes clase programada en este momento, por lo que no hay asistencia que
            validar.
          </p>
          <Link to="/home" className="btn-ghost">
            ← Volver al inicio
          </Link>
        </div>
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Tu asistencia de esta clase ya está registrada.
                </p>
                <EstadoBadge estado={registro.estado} />
              </div>
            ) : (
              <>
                <button
                  onClick={() => void confirmarAsistencia()}
                  disabled={!beaconDetectado || working}
                  className="btn-primary"
                >
                  {working ? 'Guardando…' : 'Confirmar asistencia'}
                </button>

                {!mostrarPin ? (
                  <button
                    onClick={() => {
                      setResultado(null)
                      setMostrarPin(true)
                    }}
                    disabled={working}
                    className="btn-ghost"
                  >
                    Registrar manualmente
                  </button>
                ) : (
                  <form
                    onSubmit={confirmarManual}
                    className="flex flex-col gap-3 rounded-xl bg-fondo p-4"
                  >
                    <label htmlFor="pin" className="text-sm font-semibold text-gray-700">
                      Confirma con tu PIN de 4 dígitos
                    </label>
                    <input
                      id="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      required
                      placeholder="••••"
                      className="input text-center text-lg font-bold tracking-[0.5em]"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={working || pin.length !== 4}
                        className="btn-primary flex-1"
                      >
                        {working ? 'Guardando…' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMostrarPin(false)
                          setPin('')
                        }}
                        className="btn-ghost flex-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            <Link to="/home" className="btn-ghost">
              ← Volver al inicio
            </Link>
          </section>
        </>
      )}
    </Layout>
  )
}
