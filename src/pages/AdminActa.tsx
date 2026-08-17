import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Logo from '../components/Logo'
import { IconDownload } from '../components/icons'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { ReporteDetalle } from '../types'

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function primerDiaMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminActa() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const desde = params.get('desde') || primerDiaMes()
  const hasta = params.get('hasta') || hoy()

  const [nombre, setNombre] = useState('')
  const [detalle, setDetalle] = useState<ReporteDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    const [resProf, resRep] = await Promise.all([
      supabase.from('profesores').select('nombre, apellidos, numero_empleado').eq('id', id).maybeSingle(),
      supabase.rpc('generar_reporte_asistencia', {
        p_fecha_desde: desde,
        p_fecha_hasta: hasta,
        p_profesor_id: id,
      }),
    ])
    if (resRep.error) {
      setError('No se pudo generar el acta. ¿Iniciaste sesión como administrador?')
    } else {
      const p = resProf.data
      setNombre(
        p ? `${p.nombre} ${p.apellidos}${p.numero_empleado ? ` (${p.numero_empleado})` : ''}` : ''
      )
      setDetalle((resRep.data ?? []) as ReporteDetalle[])
    }
    setLoading(false)
  }, [id, desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const totales = useMemo(() => {
    const t = { presente: 0, tarde: 0, falta: 0, justificada: 0, total: detalle.length }
    for (const d of detalle) {
      if (d.justificado) t.justificada++
      else t[d.estado]++
    }
    return t
  }, [detalle])

  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-fondo px-4 py-6 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/admin/reportes" className="text-sm font-semibold text-udeg-azul hover:underline">
            ← Reportes
          </Link>
          <button onClick={() => window.print()} className="btn-primary">
            <IconDownload className="h-4 w-4" />
            Imprimir / Guardar PDF
          </button>
        </div>

        {loading ? (
          <Spinner label="Generando acta…" />
        ) : error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
        ) : (
          <div className="horario-print rounded-2xl border border-gray-100 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
            {/* Encabezado */}
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
              <div className="flex items-center gap-3">
                <Logo size={52} />
                <div>
                  <p className="text-lg font-bold text-udeg-azul">Preparatoria 21 · UdeG</p>
                  <p className="text-sm font-semibold text-gray-700">Acta de asistencia docente</p>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Impreso: {fechaImpresion}</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold text-gray-700">Profesor:</span> {nombre}
              </p>
              <p className="sm:text-right">
                <span className="font-semibold text-gray-700">Periodo:</span>{' '}
                {formatFecha(desde)} — {formatFecha(hasta)}
              </p>
            </div>

            {/* Totales */}
            <div className="mb-5 grid grid-cols-4 gap-2 text-center">
              {[
                ['Asistencias', totales.presente, 'text-emerald-600'],
                ['Retardos', totales.tarde, 'text-amber-600'],
                ['Faltas', totales.falta, 'text-red-600'],
                ['Justificadas', totales.justificada, 'text-udeg-azul'],
              ].map(([etq, val, color]) => (
                <div key={etq as string} className="rounded-lg border border-gray-200 py-2">
                  <p className={`text-2xl font-bold ${color}`}>{val}</p>
                  <p className="text-[11px] font-medium text-gray-500">{etq}</p>
                </div>
              ))}
            </div>

            {/* Detalle */}
            {detalle.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Sin clases registradas en el periodo.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-500">
                    <th className="py-1.5 font-semibold">Fecha</th>
                    <th className="py-1.5 font-semibold">Día</th>
                    <th className="py-1.5 font-semibold">Materia</th>
                    <th className="py-1.5 font-semibold">Programada</th>
                    <th className="py-1.5 font-semibold">Entrada</th>
                    <th className="py-1.5 font-semibold">Salida</th>
                    <th className="py-1.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d) => (
                    <tr key={`${d.horario_id}-${d.fecha}`} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">{formatFecha(d.fecha)}</td>
                      <td className="py-1.5 text-gray-500">{DIAS[d.dia_semana] ?? ''}</td>
                      <td className="py-1.5 text-gray-700">{d.materia_nombre}</td>
                      <td className="py-1.5 tabular-nums text-gray-600">
                        {formatHora(d.hora_inicio)}–{formatHora(d.hora_fin)}
                      </td>
                      <td className="py-1.5 tabular-nums text-gray-600">
                        {d.hora_registro ? formatHoraRegistro(d.hora_registro) : '—'}
                      </td>
                      <td className="py-1.5 tabular-nums text-gray-600">
                        {d.hora_salida ? formatHoraRegistro(d.hora_salida) : '—'}
                      </td>
                      <td className="py-1.5 font-semibold">
                        {d.justificado
                          ? 'Justificada'
                          : d.estado === 'presente'
                            ? 'Presente'
                            : d.estado === 'tarde'
                              ? 'Tarde'
                              : 'Falta'}
                        {d.justificado && d.motivo ? (
                          <span className="font-normal text-gray-400"> · {d.motivo}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Firmas */}
            <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-gray-600">
              <div>
                <div className="border-t border-gray-400 pt-1">Firma del profesor</div>
              </div>
              <div>
                <div className="border-t border-gray-400 pt-1">Secretaría Académica</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
