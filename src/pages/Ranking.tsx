import { useCallback, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { SkeletonTable } from '../components/Skeleton'
import { IconTrophy } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { RankingItem } from '../types'

const MEDALLAS = ['🥇', '🥈', '🥉']

/** Nombre del mes en curso, capitalizado (para el encabezado) */
function mesEnCurso(): string {
  const m = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export default function Ranking() {
  const { profesor } = useAuth()
  const [filas, setFilas] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_ranking_asistencia', { p_limit: 10 })
    if (err) setError('No se pudo cargar el ranking. Intenta de nuevo.')
    else setFilas((data ?? []) as RankingItem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <Layout>
      <div className="flex items-center gap-2">
        <IconTrophy className="h-6 w-6 text-udeg-naranja" />
        <h1 className="text-xl font-bold text-gray-900">Ranking de asistencia</h1>
      </div>
      <p className="mt-0.5 text-sm text-gray-500">
        Top 10 maestros por porcentaje de asistencia · {mesEnCurso()}
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-5">
          <SkeletonTable rows={10} cols={3} />
        </div>
      ) : !filas.some((f) => f.asistencias > 0) ? (
        <p className="card mt-5 text-sm text-gray-600">
          Aún no hay asistencias registradas este mes. El ranking aparecerá en cuanto los
          maestros empiecen a validar su asistencia.
        </p>
      ) : (
        <ol className="mt-5 flex flex-col gap-2">
          {filas.map((f, i) => {
            const esYo = f.profesor_id === profesor?.id
            const podio = i < 3
            return (
              <li
                key={f.profesor_id}
                className={`card flex items-center gap-3 py-3.5 ${
                  podio ? 'border-udeg-naranja/40 bg-udeg-naranja-light/40' : ''
                } ${esYo ? 'ring-2 ring-udeg-azul' : ''}`}
              >
                <span
                  className={`flex w-8 shrink-0 justify-center text-lg font-bold ${
                    podio ? '' : 'text-gray-400'
                  }`}
                >
                  {podio ? MEDALLAS[i] : i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                  {f.nombre} {f.apellidos}
                  {esYo && <span className="ml-1 text-xs font-medium text-udeg-azul">(tú)</span>}
                </p>
                <span className="shrink-0 text-lg font-bold text-udeg-azul tabular-nums">
                  {Number(f.pct).toFixed(0)}%
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <p className="mt-4 text-xs text-gray-400">
        El porcentaje se calcula sobre las clases que ya debieron impartirse en el mes, sin
        contar las justificadas. Empate: gana quien tenga más asistencias.
      </p>
    </Layout>
  )
}
