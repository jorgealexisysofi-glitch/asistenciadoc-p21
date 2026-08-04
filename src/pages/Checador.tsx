import { useEffect, useRef, useState, type FormEvent } from 'react'
import Logo from '../components/Logo'
import EstadoBadge from '../components/EstadoBadge'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import { formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { EstadoAsistencia, HorarioActivo, RegistroClase, SesionProfesor } from '../types'

/** Segundos que se muestra el resultado antes de limpiar para el siguiente maestro */
const RESET_SEG = 7

type Resultado =
  | {
      tipo: 'ok' | 'ya'
      nombre: string
      materia: string
      aula: string
      estado: EstadoAsistencia
      hora: string
    }
  | { tipo: 'sin-clase'; nombre: string }
  | { tipo: 'error'; mensaje: string }

export default function Checador() {
  const [codigo, setCodigo] = useState('')
  const [nip, setNip] = useState('')
  const [working, setWorking] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [reloj, setReloj] = useState(new Date())
  const [cuenta, setCuenta] = useState(RESET_SEG)
  const codigoRef = useRef<HTMLInputElement>(null)

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Tras mostrar un resultado, cuenta regresiva y limpieza para el siguiente
  useEffect(() => {
    if (!resultado) return
    setCuenta(RESET_SEG)
    const intervalo = setInterval(() => {
      setCuenta((c) => {
        if (c <= 1) {
          clearInterval(intervalo)
          reiniciar()
          return RESET_SEG
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(intervalo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado])

  function reiniciar() {
    setResultado(null)
    setCodigo('')
    setNip('')
    // Devolver el foco al campo de código para el siguiente maestro
    setTimeout(() => codigoRef.current?.focus(), 50)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (working) return
    setWorking(true)
    try {
      // 1. Verificar identidad (código + NIP)
      const { data, error } = await supabase.rpc('verificar_nip', {
        p_numero_empleado: codigo.trim(),
        p_nip: nip.trim(),
      })
      if (error) {
        setResultado({ tipo: 'error', mensaje: 'No se pudo verificar. Intenta de nuevo.' })
        return
      }
      const prof = ((data ?? []) as SesionProfesor[])[0]
      if (!prof) {
        setResultado({ tipo: 'error', mensaje: 'Código o NIP incorrecto' })
        return
      }
      const nombre = `${prof.nombre} ${prof.apellidos}`

      // 2. Clase en curso en este momento
      const { data: hData, error: hErr } = await supabase.rpc('get_horario_activo', {
        p_profesor_id: prof.id,
        p_fecha: hoyISO(),
        p_hora: horaActual(),
      })
      if (hErr) {
        setResultado({ tipo: 'error', mensaje: 'No se pudo consultar tu horario.' })
        return
      }
      const h = ((hData ?? []) as HorarioActivo[])[0]
      if (!h) {
        setResultado({ tipo: 'sin-clase', nombre })
        return
      }

      // 3. ¿Ya estaba registrada esta clase hoy?
      const { data: regData } = await supabase.rpc('get_registro_clase', {
        p_profesor_id: prof.id,
        p_horario_id: h.horario_id,
        p_fecha: hoyISO(),
      })
      const existente = ((regData ?? []) as RegistroClase[])[0]
      if (existente) {
        setResultado({
          tipo: 'ya',
          nombre,
          materia: h.materia_nombre,
          aula: h.aula_nombre ?? '',
          estado: existente.estado,
          hora: formatHoraRegistro(existente.hora_registro),
        })
        return
      }

      // 4. Registrar (el servidor calcula presente/tarde)
      const { data: nuevo, error: errReg } = await supabase.rpc('registrar_asistencia', {
        p_profesor_id: prof.id,
        p_horario_id: h.horario_id,
        p_aula_id: h.aula_id,
        p_metodo: 'kiosco',
        p_beacon: null,
        p_lat: null,
        p_lon: null,
      })
      if (errReg) {
        console.error('[checador] registrar_asistencia:', errReg)
        setResultado({ tipo: 'error', mensaje: 'No se pudo registrar. Intenta de nuevo.' })
        return
      }
      const row = ((nuevo ?? []) as RegistroClase[])[0]
      setResultado({
        tipo: 'ok',
        nombre,
        materia: h.materia_nombre,
        aula: h.aula_nombre ?? '',
        estado: row?.estado ?? 'presente',
        hora: row ? formatHoraRegistro(row.hora_registro) : formatHora(horaActual()),
      })
    } finally {
      setWorking(false)
    }
  }

  const horaTexto = reloj.toLocaleTimeString('es-MX', { hour12: false })
  const fechaTexto = reloj.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="flex min-h-screen flex-col bg-fondo">
      <div className="h-2 bg-udeg-naranja" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-8">
        {/* Encabezado */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={72} />
          <h1 className="mt-4 text-2xl font-bold text-udeg-azul">Punto de Control</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registro de asistencia · Preparatoria 21
          </p>
          <p className="mt-3 font-mono text-4xl font-bold tabular-nums text-udeg-naranja">
            {horaTexto}
          </p>
          <p className="text-sm capitalize text-gray-500">{fechaTexto}</p>
        </div>

        {resultado ? (
          <div className="card flex flex-col items-center gap-3 text-center">
            {resultado.tipo === 'error' ? (
              <>
                <span className="text-5xl" aria-hidden="true">
                  ✗
                </span>
                <p className="text-lg font-bold text-red-600">{resultado.mensaje}</p>
              </>
            ) : resultado.tipo === 'sin-clase' ? (
              <>
                <span className="text-5xl" aria-hidden="true">
                  ℹ️
                </span>
                <p className="text-lg font-bold text-gray-800">{resultado.nombre}</p>
                <p className="text-sm text-gray-600">
                  No tienes clase programada en este momento.
                </p>
              </>
            ) : (
              <>
                <span className="text-5xl" aria-hidden="true">
                  {resultado.tipo === 'ok' ? '✅' : 'ℹ️'}
                </span>
                <p className="text-lg font-bold text-gray-800">{resultado.nombre}</p>
                <p className="text-sm text-gray-600">
                  {resultado.materia}
                  {resultado.aula ? ` · ${resultado.aula}` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <EstadoBadge estado={resultado.estado} />
                  <span className="text-sm font-semibold text-gray-700">
                    {resultado.hora}
                  </span>
                </div>
                <p className="text-sm font-medium text-emerald-700">
                  {resultado.tipo === 'ok'
                    ? '¡Asistencia registrada!'
                    : 'Tu asistencia ya estaba registrada.'}
                </p>
              </>
            )}
            <button onClick={reiniciar} className="btn-primary mt-2 w-full">
              Siguiente ({cuenta})
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            <div>
              <label htmlFor="codigo" className="mb-1.5 block text-sm font-semibold text-gray-700">
                Código
              </label>
              <input
                ref={codigoRef}
                id="codigo"
                type="text"
                required
                autoFocus
                autoComplete="off"
                placeholder="Tu número de empleado"
                className="input text-center text-lg font-bold"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="nip" className="mb-1.5 block text-sm font-semibold text-gray-700">
                PIN
              </label>
              <input
                id="nip"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
                autoComplete="off"
                placeholder="••••"
                className="input text-center text-lg font-bold tracking-[0.5em]"
                value={nip}
                onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" disabled={working} className="btn-primary w-full !py-4 !text-base">
              {working ? 'Verificando…' : 'Registrar asistencia'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          Si tienes problemas para registrar, acude a Secretaría Académica.
        </p>
      </main>
      <div className="h-2 bg-udeg-azul" />
    </div>
  )
}
