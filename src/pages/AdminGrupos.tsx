import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { IconChart } from '../components/icons'
import { supabase } from '../lib/supabase'
import type { Grupo } from '../types'

export default function AdminGrupos() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_grupos')
    if (err) {
      setError('No se pudieron cargar los grupos. ¿Iniciaste sesión como administrador?')
    } else {
      setError(null)
      setGrupos((data ?? []) as Grupo[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const filtrados = grupos.filter((g) =>
    g.grupo.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  return (
    <AdminLayout breadcrumb={[{ label: 'Grupos' }]}>
      <h1 className="text-xl font-bold text-gray-900">Grupos</h1>
      <p className="mt-1 text-sm text-gray-500">
        Grupos de alumnos y su horario semanal. Toca un grupo para verlo e imprimirlo.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={2} />
        </div>
      ) : grupos.length === 0 ? (
        <div className="card mt-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-800">Aún no hay grupos.</p>
          <p className="mt-1">
            Los grupos se llenan al importar los horarios desde el Excel de cargas (columna
            «Grupo»). Ve a{' '}
            <Link to="/admin/horarios" className="font-semibold text-udeg-azul hover:underline">
              Importar horarios
            </Link>{' '}
            y vuelve a subir el archivo incluyendo esa columna.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 max-w-xs">
            <input
              type="text"
              className="input !py-2"
              placeholder="Buscar grupo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtrados.map((g) => (
              <Link
                key={g.grupo}
                to={`/admin/grupo/${encodeURIComponent(g.grupo)}`}
                className="card flex flex-col items-center gap-1 text-center transition-colors hover:border-udeg-naranja"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-udeg-azul-light">
                  <IconChart className="h-5 w-5 text-udeg-azul" />
                </span>
                <p className="mt-1 text-lg font-bold text-gray-900">{g.grupo}</p>
                <p className="text-xs text-gray-500">
                  {g.clases} {g.clases === 1 ? 'clase' : 'clases'}
                </p>
              </Link>
            ))}
            {filtrados.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-gray-500">
                Ningún grupo coincide con «{busqueda}».
              </p>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  )
}
