import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { hoyISO, supabase } from '../lib/supabase'
import type { EstadoAsistencia } from '../types'

interface RegistroReporte {
  id: string
  profesor_id: string
  estado: EstadoAsistencia
  fecha: string
  profesor: { nombre: string; apellidos: string } | null
}

/** Hace `dias` días en YYYY-MM-DD */
function fechaHace(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export default function AdminReportes() {
  const [desde, setDesde] = useState(fechaHace(7))
  const [hasta, setHasta] = useState(hoyISO())
  const [registros, setRegistros] = useState<RegistroReporte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('registros_asistencia')
      .select('id, profesor_id, estado, fecha, profesor:profesores(nombre, apellidos)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
    if (err) {
      setError('No se pudo generar el reporte.')
    } else {
      setRegistros((data ?? []) as unknown as RegistroReporte[])
    }
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const resumen = useMemo(() => {
    const porProfesor = new Map<
      string,
      { nombre: string; presente: number; tarde: number; ausente: number }
    >()
    for (const r of registros) {
      const nombre = r.profesor
        ? `${r.profesor.apellidos}, ${r.profesor.nombre}`
        : 'Sin ficha'
      const fila = porProfesor.get(r.profesor_id) ?? {
        nombre,
        presente: 0,
        tarde: 0,
        ausente: 0,
      }
      fila[r.estado] += 1
      porProfesor.set(r.profesor_id, fila)
    }
    return [...porProfesor.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [registros])

  return (
    <AdminLayout breadcrumb={[{ label: 'Reportes' }]}>
      <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Resumen de asistencia por profesor en el periodo seleccionado.
      </p>

      <div className="card mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div>
          <label htmlFor="r-desde" className="mb-1 block text-xs font-semibold text-gray-500">
            Desde
          </label>
          <input
            id="r-desde"
            type="date"
            className="input !py-2"
            value={desde}
            onChange={(e) => setDesde(e.target.value || fechaHace(7))}
          />
        </div>
        <div>
          <label htmlFor="r-hasta" className="mb-1 block text-xs font-semibold text-gray-500">
            Hasta
          </label>
          <input
            id="r-hasta"
            type="date"
            className="input !py-2"
            value={hasta}
            onChange={(e) => setHasta(e.target.value || hoyISO())}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={5} cols={5} />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Profesor</th>
                <th className="px-4 py-3 text-center font-semibold">Presente</th>
                <th className="px-4 py-3 text-center font-semibold">Tarde</th>
                <th className="px-4 py-3 text-center font-semibold">Ausente</th>
                <th className="px-4 py-3 text-center font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Sin registros en el periodo seleccionado.
                  </td>
                </tr>
              ) : (
                resumen.map((f) => (
                  <tr key={f.nombre} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-gray-800">{f.nombre}</td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-600">
                      {f.presente}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-amber-600">
                      {f.tarde}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-red-600">
                      {f.ausente}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {f.presente + f.tarde + f.ausente}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
