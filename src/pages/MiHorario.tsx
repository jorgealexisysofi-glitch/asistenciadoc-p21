import { useCallback, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import Logo from '../components/Logo'
import { IconDownload } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatHora } from '../lib/asistencia'
import type { HorarioProfesor } from '../types'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const
const HORA_INICIO = 7 // 07:00
const HORA_FIN = 21 // 21:00
const HORAS = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i)
const CICLO = '2026-A'

/** 'HH:MM[:SS]' → minutos desde medianoche */
function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

export default function MiHorario() {
  const { profesor } = useAuth()
  const [horarios, setHorarios] = useState<HorarioProfesor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const profesorId = profesor?.id

  const cargar = useCallback(async () => {
    if (!profesorId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_horarios_profesor', {
      p_profesor_id: profesorId,
    })
    if (err) {
      setError('No se pudo cargar tu horario. Intenta de nuevo.')
    } else {
      setHorarios((data ?? []) as HorarioProfesor[])
    }
    setLoading(false)
  }, [profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Clases de lunes a viernes dentro del rango horario visible
  const clases = horarios.filter((h) => h.dia_semana >= 1 && h.dia_semana <= 5)

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mi horario</h1>
          <p className="mt-1 text-sm text-gray-500">Ciclo {CICLO}</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary">
          <IconDownload className="h-4 w-4" />
          Imprimir / Guardar PDF
        </button>
      </div>

      {loading ? (
        <Spinner label="Cargando tu horario…" />
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : (
        <div className="horario-print rounded-2xl border border-gray-100 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          {/* Encabezado (también se imprime) */}
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <Logo size={44} />
              <div>
                <p className="text-base font-bold text-udeg-azul">Preparatoria 21 · UdeG</p>
                <p className="text-sm font-semibold text-gray-700">
                  {profesor ? `${profesor.nombre} ${profesor.apellidos}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p className="font-semibold text-gray-700">Ciclo {CICLO}</p>
              <p>Impreso: {fechaImpresion}</p>
            </div>
          </div>

          {clases.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No tienes horarios registrados de lunes a viernes.
            </p>
          ) : (
            <div
              className="grid overflow-hidden rounded-xl border border-gray-200 text-xs"
              style={{
                gridTemplateColumns: '60px repeat(5, 1fr)',
                gridTemplateRows: `28px repeat(${HORAS.length}, minmax(38px, 1fr))`,
              }}
            >
              {/* Esquina superior izquierda */}
              <div className="border-b border-r border-gray-200 bg-gray-50" />
              {/* Encabezados de día */}
              {DIAS.map((dia, di) => (
                <div
                  key={dia}
                  className="flex items-center justify-center border-b border-gray-200 bg-udeg-azul-light font-semibold text-udeg-azul"
                  style={{ gridColumn: di + 2, gridRow: 1, borderRight: di < 4 ? undefined : 'none' }}
                >
                  {dia}
                </div>
              ))}
              {/* Etiquetas de hora */}
              {HORAS.map((h, hi) => (
                <div
                  key={h}
                  className="flex items-start justify-end border-r border-t border-gray-200 bg-gray-50 px-1.5 pt-1 font-medium text-gray-400"
                  style={{ gridColumn: 1, gridRow: hi + 2 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
              {/* Celdas de fondo (para las líneas de la rejilla) */}
              {DIAS.map((_, di) =>
                HORAS.map((h, hi) => (
                  <div
                    key={`${di}-${h}`}
                    className="border-t border-gray-100"
                    style={{
                      gridColumn: di + 2,
                      gridRow: hi + 2,
                      borderRight: di < 4 ? '1px solid #f3f4f6' : 'none',
                    }}
                  />
                ))
              )}
              {/* Bloques de clase */}
              {clases.map((c) => {
                const inicioMin = aMinutos(c.hora_inicio)
                const finMin = aMinutos(c.hora_fin)
                const filaInicio = Math.max(0, Math.floor(inicioMin / 60) - HORA_INICIO) + 2
                const filaFin = Math.min(HORAS.length, Math.ceil(finMin / 60) - HORA_INICIO) + 2
                return (
                  <div
                    key={c.horario_id}
                    className="m-0.5 flex flex-col justify-center overflow-hidden rounded-md bg-udeg-naranja px-1.5 py-1 text-white"
                    style={{
                      gridColumn: c.dia_semana + 1,
                      gridRow: `${filaInicio} / ${Math.max(filaInicio + 1, filaFin)}`,
                    }}
                  >
                    <p className="truncate text-[11px] font-bold leading-tight">
                      {c.materia_nombre}
                    </p>
                    <p className="truncate text-[10px] leading-tight opacity-90">
                      {c.aula_nombre ?? 'Aula por asignar'}
                    </p>
                    <p className="text-[9px] leading-tight opacity-80">
                      {formatHora(c.hora_inicio)}–{formatHora(c.hora_fin)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
