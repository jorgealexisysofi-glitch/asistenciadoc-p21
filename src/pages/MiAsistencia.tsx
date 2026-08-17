import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { EstadoReporte, MiAsistenciaItem } from '../types'

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function primerDiaMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const estiloEstado: Record<EstadoReporte, string> = {
  presente: 'bg-emerald-50 text-emerald-700',
  tarde: 'bg-amber-50 text-amber-700',
  falta: 'bg-red-50 text-red-700',
}
const etiquetaEstado: Record<EstadoReporte, string> = {
  presente: 'Presente',
  tarde: 'Tarde',
  falta: 'Falta',
}

export default function MiAsistencia() {
  const { profesor } = useAuth()
  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoy())
  const [items, setItems] = useState<MiAsistenciaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const profesorId = profesor?.id

  const cargar = useCallback(async () => {
    if (!profesorId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_mi_asistencia', {
      p_profesor_id: profesorId,
      p_fecha_desde: desde,
      p_fecha_hasta: hasta,
    })
    if (err) {
      setError('No se pudo cargar tu asistencia. Intenta de nuevo.')
    } else {
      setError(null)
      setItems((data ?? []) as MiAsistenciaItem[])
    }
    setLoading(false)
  }, [profesorId, desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const resumen = useMemo(() => {
    const r = { presente: 0, tarde: 0, falta: 0, justificada: 0, total: items.length }
    for (const it of items) {
      if (it.justificado) r.justificada++
      else r[it.estado]++
    }
    const base = r.total - r.justificada
    const pct = base > 0 ? Math.round(((r.presente + r.tarde) / base) * 100) : null
    return { ...r, pct }
  }, [items])

  return (
    <Layout>
      <h1 className="text-xl font-bold text-gray-900">Mi asistencia</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tu registro de asistencia. Si ves algo mal, avisa a Secretaría Académica.
      </p>

      {/* Filtro de fechas */}
      <div className="card mt-5 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="desde" className="mb-1 block text-xs font-semibold text-gray-500">
            Desde
          </label>
          <input id="desde" type="date" className="input !py-2" value={desde} onChange={(e) => setDesde(e.target.value || primerDiaMes())} />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-xs font-semibold text-gray-500">
            Hasta
          </label>
          <input id="hasta" type="date" className="input !py-2" value={hasta} onChange={(e) => setHasta(e.target.value || hoy())} />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Resumen */}
          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[
              ['Asist.', resumen.presente, 'text-emerald-600'],
              ['Retardos', resumen.tarde, 'text-amber-600'],
              ['Faltas', resumen.falta, 'text-red-600'],
              ['Justif.', resumen.justificada, 'text-udeg-azul'],
            ].map(([etq, val, color]) => (
              <div key={etq as string} className="card !p-3">
                <p className={`text-2xl font-bold ${color}`}>{val}</p>
                <p className="text-[11px] font-medium text-gray-500">{etq}</p>
              </div>
            ))}
          </div>
          {resumen.pct != null && (
            <p className="mt-2 text-center text-sm text-gray-500">
              Asistencia:{' '}
              <span className="font-bold text-gray-800">{resumen.pct}%</span>
              {resumen.justificada > 0 && ' (sin contar justificadas)'}
            </p>
          )}

          {/* Detalle */}
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Detalle
            </h2>
            {items.length === 0 ? (
              <p className="card text-sm text-gray-500">
                Sin clases en el rango seleccionado.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((it) => (
                  <li key={`${it.horario_id}-${it.fecha}`} className="card flex items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {it.materia_nombre}
                      </p>
                      <p className="text-xs text-gray-500">
                        {DIAS[it.dia_semana]} {formatFecha(it.fecha)} ·{' '}
                        {formatHora(it.hora_inicio)}–{formatHora(it.hora_fin)}
                        {it.hora_registro ? ` · llegó ${formatHoraRegistro(it.hora_registro)}` : ''}
                      </p>
                      {it.justificado && it.motivo ? (
                        <p className="mt-0.5 text-xs text-udeg-azul">Justificada: {it.motivo}</p>
                      ) : null}
                    </div>
                    {it.justificado ? (
                      <span className="badge shrink-0 bg-udeg-azul-light text-udeg-azul">Justificada</span>
                    ) : (
                      <span className={`badge shrink-0 ${estiloEstado[it.estado]}`}>
                        {etiquetaEstado[it.estado]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  )
}
