import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { IconChevronDown, IconDownload } from '../components/icons'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { EstadoReporte, ReporteDetalle } from '../types'

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Fecha local hoy en YYYY-MM-DD */
function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lunes de la semana actual en YYYY-MM-DD */
function lunes(): string {
  const d = new Date()
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Minutos del día (local) de un timestamptz */
function minutosDelDia(ts: string): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface ResumenProfesor {
  id: string
  nombre: string
  apellidos: string
  presente: number
  tarde: number
  falta: number
  total: number
  pct: number
  avgLlegada: string | null
  avgDif: number | null
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

function BadgeReporte({ estado }: { estado: EstadoReporte }) {
  return <span className={`badge ${estiloEstado[estado]}`}>{etiquetaEstado[estado]}</span>
}

export default function AdminReportes() {
  const [desde, setDesde] = useState(lunes())
  const [hasta, setHasta] = useState(hoy())
  const [busquedaProf, setBusquedaProf] = useState('')
  const [profesores, setProfesores] = useState<{ id: string; nombre: string; apellidos: string }[]>([])
  const [detalle, setDetalle] = useState<ReporteDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  // Cargar profesores para el filtro (una vez)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profesores')
        .select('id, nombre, apellidos')
        .order('apellidos')
      setProfesores(data ?? [])
    })()
  }, [])

  // id del profesor seleccionado (por el texto del combobox), o null = todos
  const profesorId = useMemo(() => {
    const q = busquedaProf.trim().toLowerCase()
    if (!q) return null
    const p = profesores.find((x) => `${x.apellidos}, ${x.nombre}`.toLowerCase() === q)
    return p?.id ?? null
  }, [busquedaProf, profesores])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('generar_reporte_asistencia', {
      p_fecha_desde: desde,
      p_fecha_hasta: hasta,
      p_profesor_id: profesorId,
    })
    if (err) {
      setError('No se pudo generar el reporte. ¿Iniciaste sesión como administrador?')
    } else {
      setDetalle((data ?? []) as ReporteDetalle[])
    }
    setLoading(false)
  }, [desde, hasta, profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Agregación por profesor
  const resumen = useMemo<ResumenProfesor[]>(() => {
    const mapa = new Map<string, ResumenProfesor & { sumLlegada: number; nLlegada: number; sumDif: number }>()
    for (const r of detalle) {
      let fila = mapa.get(r.profesor_id)
      if (!fila) {
        fila = {
          id: r.profesor_id,
          nombre: r.profesor_nombre,
          apellidos: r.profesor_apellidos,
          presente: 0,
          tarde: 0,
          falta: 0,
          total: 0,
          pct: 0,
          avgLlegada: null,
          avgDif: null,
          sumLlegada: 0,
          nLlegada: 0,
          sumDif: 0,
        }
        mapa.set(r.profesor_id, fila)
      }
      fila.total++
      fila[r.estado]++
      if (r.hora_registro) {
        fila.sumLlegada += minutosDelDia(r.hora_registro)
        fila.sumDif += r.diferencia_min ?? 0
        fila.nLlegada++
      }
    }
    return [...mapa.values()]
      .map((f) => ({
        ...f,
        pct: f.total > 0 ? Math.round(((f.presente + f.tarde) / f.total) * 100) : 0,
        avgLlegada: f.nLlegada > 0 ? minutosAHora(f.sumLlegada / f.nLlegada) : null,
        avgDif: f.nLlegada > 0 ? Math.round(f.sumDif / f.nLlegada) : null,
      }))
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
  }, [detalle])

  const detallePorProfesor = useMemo(() => {
    const mapa = new Map<string, ReporteDetalle[]>()
    for (const r of detalle) {
      const arr = mapa.get(r.profesor_id) ?? []
      arr.push(r)
      mapa.set(r.profesor_id, arr)
    }
    return mapa
  }, [detalle])

  async function exportar() {
    if (detalle.length === 0) {
      toast.error('No hay datos para exportar.')
      return
    }
    const XLSX = await import('xlsx')

    const hojaResumen = resumen.map((r) => ({
      Profesor: `${r.apellidos}, ${r.nombre}`,
      Asistencias: r.presente,
      Retardos: r.tarde,
      Faltas: r.falta,
      'Total clases': r.total,
      '% Asistencia': r.pct,
      'Llegada promedio': r.avgLlegada ?? '',
    }))

    const hojaDetalle = detalle.map((r) => ({
      Fecha: formatFecha(r.fecha),
      Día: DIAS[r.dia_semana] ?? '',
      Profesor: `${r.profesor_apellidos}, ${r.profesor_nombre}`,
      Materia: r.materia_nombre,
      Aula: r.aula_nombre ?? 'Sin aula',
      'Hora programada': `${formatHora(r.hora_inicio)}-${formatHora(r.hora_fin)}`,
      'Hora real': r.hora_registro ? formatHoraRegistro(r.hora_registro) : '',
      Estado: etiquetaEstado[r.estado],
      'Diferencia (min)': r.diferencia_min ?? '',
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaResumen), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDetalle), 'Detalle')
    XLSX.writeFile(wb, `Reporte_Asistencia_${desde}_a_${hasta}.xlsx`)
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Reportes' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes de asistencia</h1>
          <p className="mt-1 text-sm text-gray-500">
            Asistencias, retardos y faltas por profesor en el rango seleccionado.
          </p>
        </div>
        <button onClick={() => void exportar()} className="btn-secondary">
          <IconDownload className="h-4 w-4" />
          Exportar a Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="card mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="desde" className="mb-1 block text-xs font-semibold text-gray-500">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            className="input !py-2"
            value={desde}
            onChange={(e) => setDesde(e.target.value || lunes())}
          />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-xs font-semibold text-gray-500">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            className="input !py-2"
            value={hasta}
            onChange={(e) => setHasta(e.target.value || hoy())}
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="prof" className="mb-1 block text-xs font-semibold text-gray-500">
            Profesor (vacío = todos)
          </label>
          <input
            id="prof"
            list="lista-profesores"
            className="input !py-2"
            placeholder="Buscar profesor…"
            value={busquedaProf}
            onChange={(e) => setBusquedaProf(e.target.value)}
          />
          <datalist id="lista-profesores">
            {profesores.map((p) => (
              <option key={p.id} value={`${p.apellidos}, ${p.nombre}`} />
            ))}
          </datalist>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={6} />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Profesor</th>
                <th className="px-4 py-3 text-center font-semibold">Asistencias</th>
                <th className="px-4 py-3 text-center font-semibold">Retardos</th>
                <th className="px-4 py-3 text-center font-semibold">Faltas</th>
                <th className="px-4 py-3 text-center font-semibold">% Asist.</th>
                <th className="px-4 py-3 text-center font-semibold">Llegada prom.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Sin clases en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                resumen.map((r) => (
                  <FilaResumen
                    key={r.id}
                    resumen={r}
                    detalle={detallePorProfesor.get(r.id) ?? []}
                    expandido={expandido === r.id}
                    onToggle={() => setExpandido((e) => (e === r.id ? null : r.id))}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}

interface FilaProps {
  resumen: ResumenProfesor
  detalle: ReporteDetalle[]
  expandido: boolean
  onToggle: () => void
}

function FilaResumen({ resumen: r, detalle, expandido, onToggle }: FilaProps) {
  const pctColor =
    r.pct >= 90 ? 'text-emerald-600' : r.pct >= 75 ? 'text-amber-600' : 'text-red-600'
  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50/60"
        onClick={onToggle}
        aria-expanded={expandido}
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <IconChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                expandido ? 'rotate-180' : ''
              }`}
            />
            {r.apellidos}, {r.nombre}
          </span>
        </td>
        <td className="px-4 py-3 text-center font-semibold text-emerald-600">{r.presente}</td>
        <td className="px-4 py-3 text-center font-semibold text-amber-600">{r.tarde}</td>
        <td className="px-4 py-3 text-center font-semibold text-red-600">{r.falta}</td>
        <td className={`px-4 py-3 text-center font-bold ${pctColor}`}>{r.pct}%</td>
        <td className="px-4 py-3 text-center text-gray-600">
          {r.avgLlegada ?? '—'}
          {r.avgDif != null && (
            <span className="ml-1 text-xs text-gray-400">
              ({r.avgDif > 0 ? '+' : ''}
              {r.avgDif}m)
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-xs font-semibold text-udeg-azul">
            {expandido ? 'Ocultar' : 'Ver detalle'}
          </span>
        </td>
      </tr>

      {expandido && (
        <tr className="border-b border-gray-50 bg-fondo/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="overflow-x-auto rounded-xl bg-white">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Día</th>
                    <th className="px-3 py-2 font-semibold">Materia</th>
                    <th className="px-3 py-2 font-semibold">Aula</th>
                    <th className="px-3 py-2 font-semibold">Programada</th>
                    <th className="px-3 py-2 font-semibold">Real</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-700">{formatFecha(d.fecha)}</td>
                      <td className="px-3 py-2 text-gray-500">{DIAS[d.dia_semana] ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{d.materia_nombre}</td>
                      <td className="px-3 py-2 text-gray-500">{d.aula_nombre ?? 'Sin aula'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">
                        {formatHora(d.hora_inicio)}–{formatHora(d.hora_fin)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">
                        {d.hora_registro ? formatHoraRegistro(d.hora_registro) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeReporte estado={d.estado} />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-500">
                        {d.diferencia_min == null
                          ? '—'
                          : `${d.diferencia_min > 0 ? '+' : ''}${d.diferencia_min}m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
