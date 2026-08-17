import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { supabase } from '../lib/supabase'
import { formatFecha, formatHoraRegistro } from '../lib/asistencia'
import type { BitacoraItem } from '../types'

const ETIQUETA_ACCION: Record<string, string> = {
  estado: 'Cambio de estado',
  justificar: 'Justificación',
  quitar_justif: 'Quitó justificación',
}

const ETIQUETA_DETALLE: Record<string, string> = {
  presente: 'Presente',
  tarde: 'Tarde',
  falta: 'Falta',
}

export default function AdminBitacora() {
  const [items, setItems] = useState<BitacoraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_bitacora', { p_limit: 200 })
    if (err) setError('No se pudo cargar la bitácora. ¿Iniciaste sesión como administrador?')
    else {
      setError(null)
      setItems((data ?? []) as BitacoraItem[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <AdminLayout breadcrumb={[{ label: 'Bitácora' }]}>
      <h1 className="text-xl font-bold text-gray-900">Bitácora de correcciones</h1>
      <p className="mt-1 text-sm text-gray-500">
        Registro de quién corrigió o justificó asistencias, y cuándo (últimas 200).
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={5} />
        </div>
      ) : items.length === 0 ? (
        <p className="card mt-4 text-sm text-gray-500">Aún no hay movimientos registrados.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Cuándo</th>
                <th className="px-4 py-3 font-semibold">Admin</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 font-semibold">Clase</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 tabular-nums text-gray-600">
                    {formatFecha(b.created_at)} {formatHoraRegistro(b.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.admin_email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-udeg-azul-light text-udeg-azul">
                      {ETIQUETA_ACCION[b.accion] ?? b.accion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p className="font-semibold text-gray-800">{b.profesor_nombre ?? '—'}</p>
                    <p className="text-xs text-gray-500">
                      {b.materia_nombre ?? ''}
                      {b.fecha ? ` · ${formatFecha(b.fecha)}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ETIQUETA_DETALLE[b.detalle] ?? (b.detalle || '—')}
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
