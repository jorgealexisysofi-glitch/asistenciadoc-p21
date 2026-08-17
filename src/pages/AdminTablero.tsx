import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import { formatHora, formatHoraRegistro } from '../lib/asistencia'
import type { ClaseEnCurso, ProximaClaseTablero } from '../types'

const REFRESCO_MS = 30_000

export default function AdminTablero() {
  const [params] = useSearchParams()
  const full = params.get('full') === '1'

  const [clases, setClases] = useState<ClaseEnCurso[]>([])
  const [proximas, setProximas] = useState<ProximaClaseTablero[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloj, setReloj] = useState(new Date())

  const cargar = useCallback(async () => {
    const fecha = hoyISO()
    const hora = horaActual()
    const [encurso, prox] = await Promise.all([
      supabase.rpc('get_clases_en_curso', { p_fecha: fecha, p_hora: hora }),
      supabase.rpc('get_proximas_clases', { p_fecha: fecha, p_hora: hora, p_minutos: 15 }),
    ])
    if (encurso.error) {
      setError('No se pudo cargar el tablero. ¿Iniciaste sesión como administrador?')
    } else {
      setError(null)
      setClases((encurso.data ?? []) as ClaseEnCurso[])
    }
    if (!prox.error) setProximas((prox.data ?? []) as ProximaClaseTablero[])
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
  const salieron = clases.filter((c) => c.hora_salida).length

  const reloj_hora = reloj.toLocaleTimeString('es-MX', { hour12: false })
  const reloj_fecha = reloj.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const contenido = (
    <>
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {/* Reloj grande */}
      <div className={`rounded-2xl bg-udeg-azul-light text-center ${full ? 'py-8' : 'mt-4 py-6'}`}>
        <p className={`font-mono font-bold tabular-nums text-udeg-azul ${full ? 'text-8xl' : 'text-6xl sm:text-7xl'}`}>
          {reloj_hora}
        </p>
        <p className="mt-1 text-sm capitalize text-udeg-azul/70">{reloj_fecha}</p>
      </div>

      {!loading && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card text-center">
            <p className={`font-bold text-udeg-azul ${full ? 'text-5xl' : 'text-3xl'}`}>{clases.length}</p>
            <p className="text-xs font-medium text-gray-500">Clases en curso</p>
          </div>
          <div className="card text-center">
            <p className={`font-bold text-emerald-600 ${full ? 'text-5xl' : 'text-3xl'}`}>{registradas}</p>
            <p className="text-xs font-medium text-gray-500">Ya registraron</p>
          </div>
          <div className="card text-center">
            <p className={`font-bold text-amber-600 ${full ? 'text-5xl' : 'text-3xl'}`}>{pendientes}</p>
            <p className="text-xs font-medium text-gray-500">Pendientes</p>
          </div>
          <div className="card text-center">
            <p className={`font-bold text-udeg-azul ${full ? 'text-5xl' : 'text-3xl'}`}>{salieron}</p>
            <p className="text-xs font-medium text-gray-500">Ya salieron</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={4} />
        </div>
      ) : clases.length === 0 ? (
        <p className="card mt-4 text-center text-sm text-gray-500">
          No hay clases en curso en este momento.
        </p>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className={`w-full min-w-[640px] text-left ${full ? 'text-base' : 'text-sm'}`}>
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
                <tr key={c.horario_id} className={`border-b border-gray-50 last:border-0 ${c.registrado ? '' : 'bg-amber-50/40'}`}>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="badge bg-emerald-50 text-emerald-700">
                          Entró{c.hora_registro ? ` · ${formatHoraRegistro(c.hora_registro)}` : ''}
                        </span>
                        {c.hora_salida && (
                          <span className="badge bg-udeg-azul-light text-udeg-azul">
                            Salió · {formatHoraRegistro(c.hora_salida)}
                          </span>
                        )}
                      </div>
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

      {/* Próximas clases (comienzan en ≤15 min) */}
      {!loading && proximas.length > 0 && (
        <div className="mt-6">
          <h2 className={`mb-3 font-bold text-gray-800 ${full ? 'text-2xl' : 'text-lg'}`}>
            Próximas clases <span className="text-gray-400">· comienzan en 15 min</span>
          </h2>
          <div className="card overflow-x-auto !p-0">
            <table className={`w-full min-w-[640px] text-left ${full ? 'text-base' : 'text-sm'}`}>
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Empieza en</th>
                  <th className="px-4 py-3 font-semibold">Profesor</th>
                  <th className="px-4 py-3 font-semibold">Materia</th>
                  <th className="px-4 py-3 font-semibold">Aula</th>
                  <th className="px-4 py-3 font-semibold">Horario</th>
                </tr>
              </thead>
              <tbody>
                {proximas.map((c) => (
                  <tr key={c.horario_id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <span className="badge bg-udeg-azul-light text-udeg-azul tabular-nums">
                        {c.minutos_para <= 1 ? 'menos de 1 min' : `${c.minutos_para} min`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {c.profesor_nombre} {c.profesor_apellidos}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.materia_nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{c.aula_nombre ?? 'Sin aula'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">
                      {formatHora(c.hora_inicio)}–{formatHora(c.hora_fin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )

  // Modo pantalla completa: sin menú, para dejar en un monitor
  if (full) {
    return (
      <div className="min-h-screen bg-fondo px-4 py-6 md:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Clases en curso</h1>
            <Link to="/admin/tablero" className="text-sm font-semibold text-udeg-azul hover:underline">
              ← Salir de pantalla completa
            </Link>
          </div>
          {contenido}
        </div>
      </div>
    )
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Clases ahora' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clases en curso ahora</h1>
          <p className="mt-1 text-sm text-gray-500">
            Se actualiza solo cada 30 s. Quién tiene clase en este momento y si ya registró.
          </p>
        </div>
        <a href="/admin/tablero?full=1" target="_blank" rel="noopener" className="btn-secondary">
          Pantalla completa ↗
        </a>
      </div>
      {contenido}
    </AdminLayout>
  )
}
