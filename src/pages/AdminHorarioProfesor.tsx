import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import HorarioSemanal from '../components/HorarioSemanal'
import { IconDownload } from '../components/icons'
import { supabase } from '../lib/supabase'
import type { HorarioProfesor } from '../types'

const CICLO = '2026-A'

export default function AdminHorarioProfesor() {
  const { id } = useParams<{ id: string }>()
  const [nombre, setNombre] = useState('')
  const [horarios, setHorarios] = useState<HorarioProfesor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    const [resProf, resHor] = await Promise.all([
      supabase.from('profesores').select('nombre, apellidos').eq('id', id).maybeSingle(),
      supabase.rpc('get_horarios_profesor', { p_profesor_id: id }),
    ])
    if (resHor.error) {
      setError('No se pudo cargar el horario. ¿Iniciaste sesión como administrador?')
    } else {
      const p = resProf.data
      setNombre(p ? `${p.nombre} ${p.apellidos}` : '')
      setHorarios((resHor.data ?? []) as HorarioProfesor[])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <div className="min-h-screen bg-fondo px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <Link to="/admin/profesores" className="text-sm font-semibold text-udeg-azul hover:underline">
              ← Profesores
            </Link>
            <h1 className="mt-1 text-xl font-bold text-gray-900">
              Horario de {nombre || '…'}
            </h1>
          </div>
          <button onClick={() => window.print()} className="btn-primary">
            <IconDownload className="h-4 w-4" />
            Imprimir / Guardar PDF
          </button>
        </div>

        {loading ? (
          <Spinner label="Cargando horario…" />
        ) : error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : (
          <HorarioSemanal nombre={nombre} horarios={horarios} ciclo={CICLO} />
        )}
      </div>
    </div>
  )
}
