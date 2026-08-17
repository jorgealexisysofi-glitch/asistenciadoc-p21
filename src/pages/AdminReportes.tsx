import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { SkeletonTable } from '../components/Skeleton'
import { IconChevronDown, IconDownload } from '../components/icons'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { EstadoReporte, ReporteDetalle } from '../types'

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function lunes(): string {
  const d = new Date()
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
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
  justificada: number
  total: number
  pct: number | null
  avgLlegada: string | null
  avgSalida: string | null
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

function BadgeEstado({ d }: { d: ReporteDetalle }) {
  if (d.justificado) {
    return (
      <span className="badge bg-udeg-azul-light text-udeg-azul" title={d.motivo ?? ''}>
        Justificada
      </span>
    )
  }
  return <span className={`badge ${estiloEstado[d.estado]}`}>{etiquetaEstado[d.estado]}</span>
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
  // Modal de corrección/justificación de una clase
  const [correccion, setCorreccion] = useState<ReporteDetalle | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profesores')
        .select('id, nombre, apellidos')
        .order('apellidos')
      setProfesores(data ?? [])
    })()
  }, [])

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

  const resumen = useMemo<ResumenProfesor[]>(() => {
    const mapa = new Map<
      string,
      ResumenProfesor & {
        sumLlegada: number
        nLlegada: number
        sumDif: number
        sumSalida: number
        nSalida: number
      }
    >()
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
          justificada: 0,
          total: 0,
          pct: null,
          avgLlegada: null,
          avgSalida: null,
          avgDif: null,
          sumLlegada: 0,
          nLlegada: 0,
          sumDif: 0,
          sumSalida: 0,
          nSalida: 0,
        }
        mapa.set(r.profesor_id, fila)
      }
      fila.total++
      if (r.justificado) {
        fila.justificada++
      } else {
        fila[r.estado]++
      }
      if (r.hora_registro && !r.justificado) {
        fila.sumLlegada += minutosDelDia(r.hora_registro)
        fila.sumDif += r.diferencia_min ?? 0
        fila.nLlegada++
      }
      if (r.hora_salida && !r.justificado) {
        fila.sumSalida += minutosDelDia(r.hora_salida)
        fila.nSalida++
      }
    }
    return [...mapa.values()]
      .map((f) => {
        const base = f.total - f.justificada // las justificadas no cuentan en el %
        return {
          ...f,
          pct: base > 0 ? Math.round(((f.presente + f.tarde) / base) * 100) : null,
          avgLlegada: f.nLlegada > 0 ? minutosAHora(f.sumLlegada / f.nLlegada) : null,
          avgSalida: f.nSalida > 0 ? minutosAHora(f.sumSalida / f.nSalida) : null,
          avgDif: f.nLlegada > 0 ? Math.round(f.sumDif / f.nLlegada) : null,
        }
      })
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
      Justificadas: r.justificada,
      'Total clases': r.total,
      '% Asistencia': r.pct ?? '',
      'Llegada promedio': r.avgLlegada ?? '',
      'Salida promedio': r.avgSalida ?? '',
    }))
    const hojaDetalle = detalle.map((r) => ({
      Fecha: formatFecha(r.fecha),
      Día: DIAS[r.dia_semana] ?? '',
      Profesor: `${r.profesor_apellidos}, ${r.profesor_nombre}`,
      Materia: r.materia_nombre,
      Aula: r.aula_nombre ?? 'Sin aula',
      'Hora programada': `${formatHora(r.hora_inicio)}-${formatHora(r.hora_fin)}`,
      'Hora real': r.hora_registro ? formatHoraRegistro(r.hora_registro) : '',
      'Hora salida': r.hora_salida ? formatHoraRegistro(r.hora_salida) : '',
      Estado: r.justificado ? 'Justificada' : etiquetaEstado[r.estado],
      Motivo: r.motivo ?? '',
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
            Asistencias, retardos, faltas y justificaciones por profesor.
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
          <input id="desde" type="date" className="input !py-2" value={desde} onChange={(e) => setDesde(e.target.value || lunes())} />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-xs font-semibold text-gray-500">
            Hasta
          </label>
          <input id="hasta" type="date" className="input !py-2" value={hasta} onChange={(e) => setHasta(e.target.value || hoy())} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="prof" className="mb-1 block text-xs font-semibold text-gray-500">
            Profesor (vacío = todos)
          </label>
          <input id="prof" list="lista-profesores" className="input !py-2" placeholder="Buscar profesor…" value={busquedaProf} onChange={(e) => setBusquedaProf(e.target.value)} />
          <datalist id="lista-profesores">
            {profesores.map((p) => (
              <option key={p.id} value={`${p.apellidos}, ${p.nombre}`} />
            ))}
          </datalist>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={7} />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Profesor</th>
                <th className="px-4 py-3 text-center font-semibold">Asist.</th>
                <th className="px-4 py-3 text-center font-semibold">Retardos</th>
                <th className="px-4 py-3 text-center font-semibold">Faltas</th>
                <th className="px-4 py-3 text-center font-semibold">Justif.</th>
                <th className="px-4 py-3 text-center font-semibold">% Asist.</th>
                <th className="px-4 py-3 text-center font-semibold">Llegada</th>
                <th className="px-4 py-3 text-center font-semibold">Salida</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Sin clases en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                resumen.map((r) => (
                  <FilaResumen
                    key={r.id}
                    resumen={r}
                    detalle={detallePorProfesor.get(r.id) ?? []}
                    desde={desde}
                    hasta={hasta}
                    expandido={expandido === r.id}
                    onToggle={() => setExpandido((e) => (e === r.id ? null : r.id))}
                    onCorregir={(d) => setCorreccion(d)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <ModalCorreccion
        detalle={correccion}
        onClose={() => setCorreccion(null)}
        onGuardado={async () => {
          setCorreccion(null)
          await cargar()
        }}
      />
    </AdminLayout>
  )
}

interface FilaProps {
  resumen: ResumenProfesor
  detalle: ReporteDetalle[]
  desde: string
  hasta: string
  expandido: boolean
  onToggle: () => void
  onCorregir: (d: ReporteDetalle) => void
}

function FilaResumen({ resumen: r, detalle, desde, hasta, expandido, onToggle, onCorregir }: FilaProps) {
  const pctColor =
    r.pct == null
      ? 'text-gray-400'
      : r.pct >= 90
        ? 'text-emerald-600'
        : r.pct >= 75
          ? 'text-amber-600'
          : 'text-red-600'
  return (
    <>
      <tr className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50/60" onClick={onToggle} aria-expanded={expandido}>
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <IconChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expandido ? 'rotate-180' : ''}`} />
            {r.apellidos}, {r.nombre}
          </span>
        </td>
        <td className="px-4 py-3 text-center font-semibold text-emerald-600">{r.presente}</td>
        <td className="px-4 py-3 text-center font-semibold text-amber-600">{r.tarde}</td>
        <td className="px-4 py-3 text-center font-semibold text-red-600">{r.falta}</td>
        <td className="px-4 py-3 text-center font-semibold text-udeg-azul">{r.justificada}</td>
        <td className={`px-4 py-3 text-center font-bold ${pctColor}`}>{r.pct == null ? '—' : `${r.pct}%`}</td>
        <td className="px-4 py-3 text-center text-gray-600">
          {r.avgLlegada ?? '—'}
          {r.avgDif != null && <span className="ml-1 text-xs text-gray-400">({r.avgDif > 0 ? '+' : ''}{r.avgDif}m)</span>}
        </td>
        <td className="px-4 py-3 text-center text-gray-600">{r.avgSalida ?? '—'}</td>
        <td className="px-4 py-3 text-right">
          <span className="text-xs font-semibold text-udeg-azul">{expandido ? 'Ocultar' : 'Ver detalle'}</span>
        </td>
      </tr>

      {expandido && (
        <tr className="border-b border-gray-50 bg-fondo/60">
          <td colSpan={9} className="px-4 py-4">
            <div className="mb-2 flex justify-end">
              <Link
                to={`/admin/acta/${r.id}?desde=${desde}&hasta=${hasta}`}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                <IconDownload className="h-3.5 w-3.5" />
                Acta imprimible
              </Link>
            </div>
            <div className="overflow-x-auto rounded-xl bg-white">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Día</th>
                    <th className="px-3 py-2 font-semibold">Materia</th>
                    <th className="px-3 py-2 font-semibold">Programada</th>
                    <th className="px-3 py-2 font-semibold">Entrada</th>
                    <th className="px-3 py-2 font-semibold">Salida</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Dif.</th>
                    <th className="px-3 py-2 text-right font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d) => (
                    <tr key={`${d.horario_id}-${d.fecha}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-700">{formatFecha(d.fecha)}</td>
                      <td className="px-3 py-2 text-gray-500">{DIAS[d.dia_semana] ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{d.materia_nombre}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{formatHora(d.hora_inicio)}–{formatHora(d.hora_fin)}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{d.hora_registro ? formatHoraRegistro(d.hora_registro) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{d.hora_salida ? formatHoraRegistro(d.hora_salida) : '—'}</td>
                      <td className="px-3 py-2"><BadgeEstado d={d} /></td>
                      <td className="px-3 py-2 tabular-nums text-gray-500">{d.diferencia_min == null ? '—' : `${d.diferencia_min > 0 ? '+' : ''}${d.diferencia_min}m`}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => onCorregir(d)} className="text-xs font-semibold text-udeg-azul hover:underline">
                          Corregir
                        </button>
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

// ---------- Modal de corrección / justificación ----------

function ModalCorreccion({
  detalle,
  onClose,
  onGuardado,
}: {
  detalle: ReporteDetalle | null
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const [estado, setEstado] = useState<EstadoReporte>('presente')
  const [justificado, setJustificado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [working, setWorking] = useState(false)

  // Reiniciar el formulario cuando cambia la clase seleccionada
  useEffect(() => {
    if (detalle) {
      setEstado(detalle.estado)
      setJustificado(detalle.justificado)
      setMotivo(detalle.motivo ?? '')
    }
  }, [detalle])

  if (!detalle) return null

  async function guardar() {
    if (!detalle) return
    setWorking(true)
    // 1. Corregir el estado (presente/tarde/falta)
    const { error: errEstado } = await supabase.rpc('corregir_asistencia', {
      p_horario_id: detalle.horario_id,
      p_fecha: detalle.fecha,
      p_estado: estado,
    })
    // 2. Justificar o quitar justificación
    const rpcJust = justificado
      ? supabase.rpc('justificar_clase', {
          p_horario_id: detalle.horario_id,
          p_fecha: detalle.fecha,
          p_motivo: motivo.trim(),
        })
      : supabase.rpc('quitar_justificacion', {
          p_horario_id: detalle.horario_id,
          p_fecha: detalle.fecha,
        })
    const { error: errJust } = await rpcJust
    setWorking(false)

    if (errEstado || errJust) {
      toast.error('No se pudo guardar. ¿Iniciaste sesión como administrador?')
      return
    }
    toast.success('Registro actualizado')
    await onGuardado()
  }

  return (
    <Modal open title="Corregir / justificar clase" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-fondo px-3 py-2 text-sm text-gray-600">
          <p className="font-semibold text-gray-800">
            {detalle.profesor_apellidos}, {detalle.profesor_nombre}
          </p>
          <p className="text-xs">
            {detalle.materia_nombre} · {formatFecha(detalle.fecha)} ·{' '}
            {formatHora(detalle.hora_inicio)}–{formatHora(detalle.hora_fin)}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-gray-700">Estado</p>
          <div className="flex gap-2">
            {(['presente', 'tarde', 'falta'] as EstadoReporte[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEstado(e)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  estado === e
                    ? 'border-udeg-naranja bg-udeg-naranja-light text-udeg-naranja'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {etiquetaEstado[e]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={justificado}
            onChange={(e) => setJustificado(e.target.checked)}
            className="h-4 w-4"
          />
          Marcar como justificada
        </label>

        {justificado && (
          <div>
            <label htmlFor="motivo" className="mb-1 block text-xs font-semibold text-gray-500">
              Motivo
            </label>
            <textarea
              id="motivo"
              rows={2}
              className="input"
              placeholder="Incapacidad médica, comisión oficial, permiso…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={working} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={working} className="btn-primary flex-1">
            {working ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
