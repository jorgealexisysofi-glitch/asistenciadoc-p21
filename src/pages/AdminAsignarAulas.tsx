import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { supabase } from '../lib/supabase'
import { formatHora } from '../lib/asistencia'
import type { Aula } from '../types'

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface HorarioPendiente {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  materia: { nombre: string } | null
  profesor: { nombre: string; apellidos: string } | null
}

export default function AdminAsignarAulas() {
  const [horarios, setHorarios] = useState<HorarioPendiente[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [seleccion, setSeleccion] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [resHor, resAulas] = await Promise.all([
      supabase
        .from('horarios')
        .select(
          'id, dia_semana, hora_inicio, hora_fin, materia:materias(nombre), profesor:profesores(nombre, apellidos)'
        )
        .is('aula_id', null)
        .order('dia_semana')
        .order('hora_inicio'),
      supabase.from('aulas').select('*').order('nombre'),
    ])
    if (resHor.error || resAulas.error) {
      setError('No se pudieron cargar los datos. ¿Iniciaste sesión como administrador?')
    } else {
      setHorarios((resHor.data ?? []) as unknown as HorarioPendiente[])
      setAulas((resAulas.data ?? []) as Aula[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function guardar(id: string) {
    const aulaId = seleccion[id]
    if (!aulaId) {
      toast.error('Selecciona un aula primero.')
      return
    }
    setGuardandoId(id)
    const { error: err } = await supabase
      .from('horarios')
      .update({ aula_id: aulaId })
      .eq('id', id)
    setGuardandoId(null)
    if (err) {
      toast.error('No se pudo asignar el aula.')
      return
    }
    toast.success('Aula asignada')
    // Quitar de la lista de pendientes
    setHorarios((prev) => prev.filter((h) => h.id !== id))
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Asignar aulas' }]}>
      <h1 className="text-xl font-bold text-gray-900">Asignar aulas</h1>
      <p className="mt-1 text-sm text-gray-500">
        Horarios importados que aún no tienen aula. Asigna una y guárdala.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!loading && (
        <p className="mt-4 text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{horarios.length}</span> horario(s)
          pendiente(s) de aula
        </p>
      )}

      {loading ? (
        <div className="mt-3">
          <SkeletonTable rows={6} cols={4} />
        </div>
      ) : horarios.length === 0 ? (
        <p className="card mt-3 text-sm text-gray-500">
          No hay horarios pendientes de aula. 🎉
        </p>
      ) : (
        <div className="card mt-3 overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Profesor</th>
                <th className="px-4 py-3 font-semibold">Materia</th>
                <th className="px-4 py-3 font-semibold">Día y hora</th>
                <th className="px-4 py-3 font-semibold">Aula</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {horarios.map((h) => (
                <tr key={h.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {h.profesor ? `${h.profesor.nombre} ${h.profesor.apellidos}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{h.materia?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {DIAS[h.dia_semana] ?? '—'} · {formatHora(h.hora_inicio)}–
                    {formatHora(h.hora_fin)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input !py-2"
                      value={seleccion[h.id] ?? ''}
                      onChange={(e) =>
                        setSeleccion((s) => ({ ...s, [h.id]: e.target.value }))
                      }
                    >
                      <option value="">Selecciona…</option>
                      {aulas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                          {a.edificio ? ` · ${a.edificio}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void guardar(h.id)}
                      disabled={guardandoId === h.id || !seleccion[h.id]}
                      className="btn-primary !px-4 !py-2 text-xs"
                    >
                      {guardandoId === h.id ? 'Guardando…' : 'Guardar'}
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
