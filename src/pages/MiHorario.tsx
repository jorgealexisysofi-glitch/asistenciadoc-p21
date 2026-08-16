import { useCallback, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import HorarioSemanal from '../components/HorarioSemanal'
import { IconDownload } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { HorarioProfesor } from '../types'

const CICLO = '2026-A'

export default function MiHorario() {
  const { profesor } = useAuth()
  const [horarios, setHorarios] = useState<HorarioProfesor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const profesorId = profesor?.id

  const cargar = useCallback(async () => {
    if (!profesorId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_horarios_profesor', {
      p_profesor_id: profesorId,
    })
    if (err) {
      setError('No se pudo cargar tu horario. Intenta de nuevo.')
    } else {
      setHorarios((data ?? []) as HorarioProfesor[])
    }
    setLoading(false)
  }, [profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mi horario</h1>
          <p className="mt-1 text-sm text-gray-500">Ciclo {CICLO}</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary">
          <IconDownload className="h-4 w-4" />
          Imprimir / Guardar PDF
        </button>
      </div>

      {loading ? (
        <Spinner label="Cargando tu horario…" />
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : (
        <HorarioSemanal
          nombre={profesor ? `${profesor.nombre} ${profesor.apellidos}` : ''}
          horarios={horarios}
          ciclo={CICLO}
        />
      )}
    </Layout>
  )
}
