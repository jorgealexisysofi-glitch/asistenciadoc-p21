import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import EstadoBadge from '../components/EstadoBadge'
import { Skeleton, SkeletonCards } from '../components/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import { formatHora, formatHoraRegistro, minutosHasta, saludo } from '../lib/asistencia'
import type { HistorialItem, ProximaClase } from '../types'

/** Minutos de anticipación con que se avisa la siguiente clase */
const AVISO_PROXIMA_MIN = 15

export default function ProfesorHome() {
  const { profesor } = useAuth()
  const [proxima, setProxima] = useState<ProximaClase | null>(null)
  const [registros, setRegistros] = useState<HistorialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Refresca cada 30 s para que el aviso de próxima clase aparezca solo
  const [, setTick] = useState(0)

  const profesorId = profesor?.id

  const cargar = useCallback(async () => {
    if (!profesorId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    // RPCs SECURITY DEFINER: el profesor entra por NIP (sin sesión de Supabase),
    // así que pasamos su id en vez de depender de auth.uid().
    const [resProxima, resRegistros] = await Promise.all([
      supabase.rpc('get_proxima_clase', {
        p_profesor_id: profesorId,
        p_fecha: hoyISO(),
        p_hora: horaActual(),
      }),
      supabase.rpc('get_historial_profesor', {
        p_profesor_id: profesorId,
        p_limit: 5,
      }),
    ])

    if (resProxima.error || resRegistros.error) {
      setError('No se pudo cargar tu información. Intenta de nuevo.')
    } else {
      setProxima(((resProxima.data ?? []) as ProximaClase[])[0] ?? null)
      setRegistros((resRegistros.data ?? []) as HistorialItem[])
    }
    setLoading(false)
  }, [profesorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const fechaLarga = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Aviso: clase por empezar (≤15 min) o ya en curso
  const minParaInicio = proxima ? minutosHasta(proxima.hora_inicio) : null
  const enCurso = proxima != null && minParaInicio != null && minParaInicio <= 0
  const porEmpezar =
    minParaInicio != null && minParaInicio > 0 && minParaInicio <= AVISO_PROXIMA_MIN

  return (
    <Layout>
      <h1 className="text-xl font-bold text-gray-900">
        {saludo()}, {profesor?.nombre?.split(' ')[0] ?? 'profesor(a)'} 👋
      </h1>
      <p className="mt-0.5 text-sm capitalize text-gray-500">{fechaLarga}</p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!loading && !profesor && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          Tu cuenta aún no está vinculada a una ficha de profesor. Contacta a la
          administración.
        </p>
      )}

      {loading ? (
        <div className="mt-5 space-y-5">
          <div className="card space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
          <SkeletonCards count={3} />
        </div>
      ) : (
        <>
          {(porEmpezar || enCurso) && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-udeg-naranja-light px-4 py-3 text-sm font-semibold text-udeg-naranja">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-udeg-naranja"
                aria-hidden="true"
              />
              {enCurso
                ? 'Tienes una clase en curso. Valida tu asistencia.'
                : `Tu siguiente clase empieza en ${minParaInicio} min.`}
            </p>
          )}

          {/* Próxima clase de hoy */}
          <section className="card mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              {enCurso ? 'Clase en curso' : 'Próxima clase de hoy'}
            </h2>

            {!proxima ? (
              <p className="mt-3 text-sm text-gray-600">
                Ya no tienes clases programadas por hoy. ¡Buen descanso!
              </p>
            ) : (
              <div className="mt-3">
                <p className="text-lg font-bold text-udeg-azul">
                  {proxima.materia_nombre ?? 'Clase'}
                </p>
                <p className="text-sm text-gray-500">
                  {proxima.aula_nombre ?? ''}
                  {proxima.edificio ? ` · ${proxima.edificio}` : ''} ·{' '}
                  {formatHora(proxima.hora_inicio)}–{formatHora(proxima.hora_fin)}
                </p>
              </div>
            )}
          </section>

          <Link
            to="/validar"
            className="btn-primary mt-5 w-full !py-4 !text-base shadow-md"
          >
            Validar asistencia ahora
          </Link>

          {/* Últimos registros */}
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Últimos registros
            </h2>
            {registros.length === 0 ? (
              <p className="card text-sm text-gray-500">
                Sin registros todavía. Tu historial aparecerá aquí.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {registros.map((r) => (
                  <li key={r.id} className="card flex items-center justify-between py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {r.materia_nombre ?? 'Clase'} · {r.fecha}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.aula_nombre ?? ''} · {formatHoraRegistro(r.hora_registro)} ·{' '}
                        {r.metodo_deteccion === 'manual'
                          ? 'Manual'
                          : `Beacon ${r.metodo_deteccion}`}
                      </p>
                    </div>
                    <EstadoBadge estado={r.estado} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  )
}
