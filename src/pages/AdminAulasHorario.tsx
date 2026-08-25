import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { IconBuilding } from '../components/icons'
import { supabase } from '../lib/supabase'
import type { AulaHorario } from '../types'

export default function AdminAulasHorario() {
  const [aulas, setAulas] = useState<AulaHorario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_aulas_horario')
    if (err) setError('No se pudieron cargar los salones. ¿Iniciaste sesión como administrador?')
    else {
      setError(null)
      setAulas((data ?? []) as AulaHorario[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const q = busqueda.trim().toLowerCase()
  const filtrados = aulas.filter(
    (a) => a.aula_nombre.toLowerCase().includes(q) || (a.edificio ?? '').toLowerCase().includes(q)
  )

  return (
    <AdminLayout breadcrumb={[{ label: 'Horario por salón' }]}>
      <h1 className="text-xl font-bold text-gray-900">Horario por salón</h1>
      <p className="mt-1 text-sm text-gray-500">
        Descarga el horario de cada salón para imprimirlo y ponerlo en el aula. Toca un salón para
        verlo e imprimirlo.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={2} />
        </div>
      ) : aulas.length === 0 ? (
        <p className="card mt-4 text-sm text-gray-600">
          Aún no hay salones con clases asignadas. Asigna aulas a los horarios en «Asignar aulas».
        </p>
      ) : (
        <>
          <div className="mt-5 max-w-xs">
            <input
              type="text"
              className="input !py-2"
              placeholder="Buscar salón…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtrados.map((a) => (
              <Link
                key={a.aula_id}
                to={`/admin/horario-aula/${a.aula_id}`}
                className="card flex flex-col items-center gap-1 text-center transition-colors hover:border-udeg-naranja"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-udeg-azul-light">
                  <IconBuilding className="h-5 w-5 text-udeg-azul" />
                </span>
                <p className="mt-1 text-lg font-bold text-gray-900">{a.aula_nombre}</p>
                <p className="text-xs text-gray-500">
                  {a.edificio ? `${a.edificio} · ` : ''}
                  {a.clases} {a.clases === 1 ? 'clase' : 'clases'}
                </p>
              </Link>
            ))}
            {filtrados.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-gray-500">
                Ningún salón coincide con «{busqueda}».
              </p>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  )
}
