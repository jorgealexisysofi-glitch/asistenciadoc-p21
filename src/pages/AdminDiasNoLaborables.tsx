import { useCallback, useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { IconPlus, IconTrash } from '../components/icons'
import { supabase } from '../lib/supabase'
import { formatFecha } from '../lib/asistencia'
import type { DiaNoLaborable } from '../types'

export default function AdminDiasNoLaborables() {
  const [dias, setDias] = useState<DiaNoLaborable[]>([])
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('dias_no_laborables')
      .select('*')
      .order('fecha', { ascending: false })
    if (err) setError('No se pudieron cargar los días. ¿Iniciaste sesión como administrador?')
    else {
      setError(null)
      setDias((data ?? []) as DiaNoLaborable[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!fecha) return
    setWorking(true)
    const { error: err } = await supabase
      .from('dias_no_laborables')
      .upsert({ fecha, motivo: motivo.trim() }, { onConflict: 'fecha' })
    setWorking(false)
    if (err) {
      toast.error('No se pudo guardar el día.')
      return
    }
    toast.success('Día no laborable guardado')
    setFecha('')
    setMotivo('')
    await cargar()
  }

  async function eliminar(f: string) {
    setWorking(true)
    const { error: err } = await supabase.from('dias_no_laborables').delete().eq('fecha', f)
    setWorking(false)
    if (err) {
      toast.error('No se pudo eliminar.')
      return
    }
    toast.success('Día eliminado')
    await cargar()
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Días no laborables' }]}>
      <h1 className="text-xl font-bold text-gray-900">Días no laborables</h1>
      <p className="mt-1 text-sm text-gray-500">
        Festivos y suspensiones de labores. En estos días los reportes{' '}
        <span className="font-semibold">no cuentan faltas</span>.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {/* Agregar */}
      <form onSubmit={agregar} className="card mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="fecha" className="mb-1 block text-xs font-semibold text-gray-500">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            required
            className="input !py-2"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="motivo" className="mb-1 block text-xs font-semibold text-gray-500">
            Motivo (opcional)
          </label>
          <input
            id="motivo"
            type="text"
            className="input !py-2"
            placeholder="Día festivo, suspensión, junta…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <button type="submit" disabled={working} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Agregar
        </button>
      </form>

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={5} cols={3} />
        </div>
      ) : dias.length === 0 ? (
        <p className="card mt-4 text-sm text-gray-500">No hay días no laborables registrados.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.fecha} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-gray-800">{formatFecha(d.fecha)}</td>
                  <td className="px-4 py-3 text-gray-600">{d.motivo || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void eliminar(d.fecha)}
                      disabled={working}
                      aria-label="Eliminar"
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
