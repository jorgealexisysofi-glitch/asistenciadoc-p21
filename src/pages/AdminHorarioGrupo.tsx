import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import HorarioSemanal from '../components/HorarioSemanal'
import { IconDownload } from '../components/icons'
import { supabase } from '../lib/supabase'
import type { HorarioProfesor } from '../types'

const CICLO = '2026-A'

export default function AdminHorarioGrupo() {
  const { grupo: grupoParam } = useParams<{ grupo: string }>()
  const grupo = grupoParam ? decodeURIComponent(grupoParam) : ''
  const [horarios, setHorarios] = useState<HorarioProfesor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!grupo) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_horario_grupo', { p_grupo: grupo })
    if (err) {
      setError('No se pudo cargar el horario. ¿Iniciaste sesión como administrador?')
    } else {
      setHorarios((data ?? []) as HorarioProfesor[])
    }
    setLoading(false)
  }, [grupo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <div className="min-h-screen bg-fondo px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <Link to="/admin/grupos" className="text-sm font-semibold text-udeg-azul hover:underline">
              ← Grupos
            </Link>
            <h1 className="mt-1 text-xl font-bold text-gray-900">Horario del grupo {grupo}</h1>
          </div>
          <button onClick={() => window.print()} className="btn-primary">
            <IconDownload className="h-4 w-4" />
            Imprimir / Guardar PDF
          </button>
        </div>

        {loading ? (
          <Spinner label="Cargando horario…" />
        ) : error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
        ) : (
          <HorarioSemanal nombre={`Grupo ${grupo}`} horarios={horarios} ciclo={CICLO} />
        )}
      </div>
    </div>
  )
}
