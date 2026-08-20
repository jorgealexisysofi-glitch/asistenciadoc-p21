import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { SkeletonTable } from '../components/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHoraRegistro } from '../lib/asistencia'
import type { ArchivoCiclo } from '../types'

type Accion =
  | { tipo: 'archivar' }
  | { tipo: 'restaurar'; archivo: ArchivoCiclo }
  | { tipo: 'borrar'; archivo: ArchivoCiclo }
  | null

export default function AdminCiclos() {
  const { esSesionSupabase } = useAuth()
  const [archivos, setArchivos] = useState<ArchivoCiclo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  const [accion, setAccion] = useState<Accion>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_archivos')
    if (err) setError('No se pudieron cargar los respaldos. ¿Iniciaste sesión como administrador?')
    else {
      setError(null)
      setArchivos((data ?? []) as ArchivoCiclo[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function ejecutar() {
    if (!accion) return
    setTrabajando(true)
    try {
      if (accion.tipo === 'archivar') {
        const { error: err } = await supabase.rpc('archivar_ciclo', { p_etiqueta: etiqueta.trim() })
        if (err) throw err
        toast.success('Ciclo archivado. Las vistas quedaron limpias para el nuevo ciclo.')
        setEtiqueta('')
      } else if (accion.tipo === 'restaurar') {
        const { error: err } = await supabase.rpc('restaurar_ciclo', { p_archivo_id: accion.archivo.id })
        if (err) throw err
        toast.success('Ciclo restaurado.')
      } else {
        const { error: err } = await supabase.rpc('borrar_archivo_ciclo', { p_archivo_id: accion.archivo.id })
        if (err) throw err
        toast.success('Respaldo borrado.')
      }
      setAccion(null)
      await cargar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ocurrió un error.'
      toast.error(msg)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Respaldos' }]}>
      <h1 className="text-xl font-bold text-gray-900">Respaldos de ciclo</h1>
      <p className="mt-1 text-sm text-gray-500">
        Al cambiar de ciclo, archiva el actual para guardarlo aquí y dejar las vistas limpias.
        Puedes restaurarlo cuando quieras.
      </p>

      {!esSesionSupabase && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          ⚠️ Entraste con código + NIP: esta sesión no puede archivar ni restaurar. Entra con
          «Acceso administrativo» (correo y contraseña).
        </p>
      )}

      {/* Archivar ciclo actual */}
      <section className="card mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Archivar el ciclo actual
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Guarda todos los horarios (con grupos), asistencias y justificaciones del ciclo actual y
          limpia las vistas. Los maestros, materias y aulas se conservan.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1">
            <label htmlFor="etq" className="mb-1 block text-xs font-semibold text-gray-500">
              Nombre del respaldo (ej. «Ciclo 2026-B»)
            </label>
            <input
              id="etq"
              type="text"
              className="input !py-2"
              placeholder="Ciclo 2026-B"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
            />
          </div>
          <button
            onClick={() => setAccion({ tipo: 'archivar' })}
            disabled={!esSesionSupabase}
            className="btn-primary"
          >
            Archivar ciclo
          </button>
        </div>
      </section>

      {/* Lista de respaldos */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Ciclos archivados
      </h2>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-3">
          <SkeletonTable rows={3} cols={4} />
        </div>
      ) : archivos.length === 0 ? (
        <p className="card mt-3 text-sm text-gray-500">Aún no hay ciclos archivados.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {archivos.map((a) => (
            <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{a.etiqueta || 'Ciclo sin nombre'}</p>
                <p className="text-xs text-gray-500">
                  {formatFecha(a.creado_en)} {formatHoraRegistro(a.creado_en)} ·{' '}
                  {a.n_horarios} horarios · {a.n_registros} asistencias
                  {a.creado_por ? ` · ${a.creado_por}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAccion({ tipo: 'restaurar', archivo: a })}
                  disabled={!esSesionSupabase}
                  className="btn-secondary !py-2"
                >
                  Restaurar
                </button>
                <button
                  onClick={() => setAccion({ tipo: 'borrar', archivo: a })}
                  disabled={!esSesionSupabase}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmaciones */}
      {accion && (
        <Modal
          open
          title={
            accion.tipo === 'archivar'
              ? 'Archivar ciclo actual'
              : accion.tipo === 'restaurar'
                ? 'Restaurar ciclo'
                : 'Borrar respaldo'
          }
          onClose={() => setAccion(null)}
        >
          <div className="flex flex-col gap-4">
            {accion.tipo === 'archivar' && (
              <p className="text-sm text-gray-600">
                Se guardarán los horarios, grupos, asistencias y justificaciones del ciclo actual
                en un respaldo, y las vistas quedarán <span className="font-semibold">limpias</span>.
                Nada se pierde: podrás restaurarlo desde aquí. Los maestros se conservan.
              </p>
            )}
            {accion.tipo === 'restaurar' && (
              <p className="text-sm text-gray-600">
                Se volverán a colocar como ciclo activo los{' '}
                <span className="font-semibold">{accion.archivo.n_horarios} horarios</span> y{' '}
                <span className="font-semibold">{accion.archivo.n_registros} asistencias</span> de
                «{accion.archivo.etiqueta || 'este respaldo'}».{' '}
                <span className="font-semibold">
                  Debe no haber un ciclo activo cargado (archívalo primero).
                </span>
              </p>
            )}
            {accion.tipo === 'borrar' && (
              <p className="text-sm text-gray-600">
                Se eliminará <span className="font-semibold">permanentemente</span> el respaldo «
                {accion.archivo.etiqueta || 'sin nombre'}» con sus {accion.archivo.n_registros}{' '}
                asistencias. Esto <span className="font-semibold">no se puede deshacer</span>.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAccion(null)}
                disabled={trabajando}
                className="btn-ghost flex-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void ejecutar()}
                disabled={trabajando}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                  accion.tipo === 'borrar'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-udeg-naranja hover:bg-udeg-naranja/90'
                }`}
              >
                {trabajando
                  ? 'Procesando…'
                  : accion.tipo === 'archivar'
                    ? 'Archivar'
                    : accion.tipo === 'restaurar'
                      ? 'Restaurar'
                      : 'Borrar definitivamente'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
