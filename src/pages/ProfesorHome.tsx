import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import EstadoBadge from '../components/EstadoBadge'
import BotonNotificaciones from '../components/BotonNotificaciones'
import { Skeleton, SkeletonCards } from '../components/Skeleton'
import { IconTrophy } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { horaActual, hoyISO, supabase } from '../lib/supabase'
import {
  etiquetaMetodo,
  formatFecha,
  formatHora,
  formatHoraRegistro,
  mensajePersonalizado,
  minutosHasta,
  saludo,
} from '../lib/asistencia'
import type { HistorialItem, MiResumenAsistencia, ProximaClase, RankingItem } from '../types'

/** Minutos de anticipación con que se avisa la siguiente clase */
const AVISO_PROXIMA_MIN = 15

const MEDALLAS = ['🥇', '🥈', '🥉']

export default function ProfesorHome() {
  const { profesor } = useAuth()
  const [proxima, setProxima] = useState<ProximaClase | null>(null)
  const [registros, setRegistros] = useState<HistorialItem[]>([])
  const [top3, setTop3] = useState<RankingItem[]>([])
  const [resumen, setResumen] = useState<MiResumenAsistencia | null>(null)
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
    const [resProxima, resRegistros, resRanking, resResumen] = await Promise.all([
      supabase.rpc('get_proxima_clase', {
        p_profesor_id: profesorId,
        p_fecha: hoyISO(),
        p_hora: horaActual(),
      }),
      supabase.rpc('get_historial_profesor', {
        p_profesor_id: profesorId,
        p_limit: 5,
      }),
      supabase.rpc('get_ranking_asistencia', { p_limit: 3 }),
      supabase.rpc('get_mi_resumen_asistencia', { p_profesor_id: profesorId }),
    ])

    if (resProxima.error || resRegistros.error) {
      setError('No se pudo cargar tu información. Intenta de nuevo.')
    } else {
      setProxima(((resProxima.data ?? []) as ProximaClase[])[0] ?? null)
      setRegistros((resRegistros.data ?? []) as HistorialItem[])
    }
    // Ranking y resumen son secundarios: si fallan, no bloquean la pantalla.
    setTop3(resRanking.error ? [] : ((resRanking.data ?? []) as RankingItem[]))
    setResumen(
      resResumen.error ? null : (((resResumen.data ?? []) as MiResumenAsistencia[])[0] ?? null)
    )
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

  // Mensaje personalizado de bienvenida según el patrón de asistencia reciente
  const mensaje = mensajePersonalizado(resumen)

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
          {mensaje && (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                mensaje.tono === 'alerta'
                  ? 'bg-red-50 text-red-700'
                  : mensaje.tono === 'aviso'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {mensaje.tono === 'alerta' ? '⚠️ ' : mensaje.tono === 'aviso' ? '⏰ ' : ''}
              {mensaje.texto}
            </p>
          )}

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
                  {proxima.aula_nombre ?? 'Aula por asignar'}
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

          {/* Activar recordatorios push (solo si el navegador los soporta) */}
          {profesorId && (
            <div className="mt-5">
              <BotonNotificaciones profesorId={profesorId} />
            </div>
          )}

          {/* Maestro de la Semana — top 3 por % de asistencia (solo si ya hay datos) */}
          {top3.some((r) => r.asistencias > 0) && (
            <section className="card mt-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  <IconTrophy className="h-4 w-4 text-udeg-naranja" />
                  Maestro de la Semana
                </h2>
                <Link
                  to="/ranking"
                  className="text-xs font-semibold text-udeg-azul hover:underline"
                >
                  Ver top 10 →
                </Link>
              </div>
              <ol className="mt-3 flex flex-col gap-2">
                {top3.map((r, i) => {
                  const esYo = r.profesor_id === profesorId
                  return (
                    <li
                      key={r.profesor_id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                        i === 0 ? 'bg-udeg-naranja-light' : 'bg-gray-50'
                      } ${esYo ? 'ring-2 ring-udeg-azul' : ''}`}
                    >
                      <span className="text-lg">{MEDALLAS[i]}</span>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                        {r.nombre} {r.apellidos}
                        {esYo && (
                          <span className="ml-1 text-xs font-medium text-udeg-azul">(tú)</span>
                        )}
                      </p>
                      <span className="text-sm font-bold text-udeg-azul tabular-nums">
                        {Number(r.pct).toFixed(0)}%
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

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
                        {r.materia_nombre ?? 'Clase'} · {formatFecha(r.fecha)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.aula_nombre ?? ''} · {formatHoraRegistro(r.hora_registro)} ·{' '}
                        {etiquetaMetodo(r.metodo_deteccion)}
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
