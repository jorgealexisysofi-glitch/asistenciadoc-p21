import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import { formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { ClaseEnCurso } from '../types'

const REFRESCO_MS = 30_000

export default function AdminTablero() {
  const [clases, setClases] = useState<ClaseEnCurso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloj, setReloj] = useState(new Date())

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_clases_en_curso', {
      p_fecha: hoyISO(),
      p_hora: horaActual(),
    })
    if (err) {
      setError('No se pudo cargar el tablero. ¿Iniciaste sesión como administrador?')
    } else {
      setError(null)
      setClases((data ?? []) as ClaseEnCurso[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => {
      setReloj(new Date())
      if (document.visibilityState === 'visible') void cargar()
    }, REFRESCO_MS)
    const r = setInterval(() => setReloj(new Date()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [cargar])

  const registradas = clases.filter((c) => c.registrado).length
  const pendientes = clases.length - registradas

  return (
    <AdminLayout breadcrumb={[{ label: 'Clases ahora' }]}>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Clases en curso ahora</h1>
        <p className="mt-1 text-sm text-gray-500">
          Se actualiza solo cada 30 s. Quién tiene clase en este momento y si ya registró.
        </p>
      </div>

      {/* Reloj grande, tipo reloj de pared */}
      <div className="mt-4 rounded-2xl bg-udeg-azul-light py-6 text-center">
        <p className="font-mono text-6xl font-bold tabular-nums text-udeg-azul sm:text-7xl">
          {reloj.toLocaleTimeString('es-MX', { hour12: false })}
        </p>
        <p className="mt-1 text-sm capitalize text-udeg-azul/70">
          {reloj.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {!loading && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="card text-center">
            <p className="text-3xl font-bold text-udeg-azul">{clases.length}</p>
            <p className="text-xs font-medium text-gray-500">Clases en curso</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-emerald-600">{registradas}</p>
            <p className="text-xs font-medium text-gray-500">Ya registraron</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-amber-600">{pendientes}</p>
            <p className="text-xs font-medium text-gray-500">Pendientes</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={4} />
        </div>
      ) : clases.length === 0 ? (
        <p className="card mt-4 text-sm text-gray-500">
          No hay clases en curso en este momento.
        </p>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Profesor</th>
                <th className="px-4 py-3 font-semibold">Materia</th>
                <th className="px-4 py-3 font-semibold">Aula</th>
                <th className="px-4 py-3 font-semibold">Horario</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {clases.map((c) => (
                <tr
                  key={c.horario_id}
                  className={`border-b border-gray-50 last:border-0 ${
                    c.registrado ? '' : 'bg-amber-50/40'
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {c.profesor_nombre} {c.profesor_apellidos}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.materia_nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{c.aula_nombre ?? 'Sin aula'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">
                    {formatHora(c.hora_inicio)}–{formatHora(c.hora_fin)}
                  </td>
                  <td className="px-4 py-3">
                    {c.registrado ? (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        Registró
                        {c.hora_registro ? ` · ${formatHoraRegistro(c.hora_registro)}` : ''}
                      </span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-700">Pendiente</span>
                    )}
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
