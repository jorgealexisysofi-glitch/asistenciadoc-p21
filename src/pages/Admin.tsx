import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import EstadoBadge from '../components/EstadoBadge'
import { SkeletonKpis, SkeletonTable } from '../components/Skeleton'
import { IconDownload } from '../components/icons'
import { hoyISO, supabase } from '../lib/supabase'
import { formatFecha, formatHoraRegistro } from '../lib/asistencia'
import type { DashboardKpis, ProfesorBasico, RegistroDia } from '../types'

const REFRESCO_MS = 60_000

function nombreCompleto(r: RegistroDia): string {
  return `${r.profesor_nombre} ${r.profesor_apellidos}`
}

export default function Admin() {
  const [profesores, setProfesores] = useState<ProfesorBasico[]>([])
  const [registros, setRegistros] = useState<RegistroDia[]>([])
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [fFecha, setFFecha] = useState(hoyISO())
  const [fProfesor, setFProfesor] = useState('todos')
  const [fEstado, setFEstado] = useState('todos')

  const cargar = useCallback(async () => {
    setError(null)
    const [resKpis, resReg, resProf] = await Promise.all([
      supabase.rpc('get_dashboard_kpis'),
      supabase.rpc('get_registros_dia', { p_fecha: fFecha }),
      supabase.rpc('get_profesores_basico'),
    ])

    if (resKpis.error || resReg.error || resProf.error) {
      setError('No se pudieron cargar los datos del panel. Intenta de nuevo.')
    } else {
      setKpis(((resKpis.data ?? []) as DashboardKpis[])[0] ?? null)
      setRegistros((resReg.data ?? []) as RegistroDia[])
      setProfesores((resProf.data ?? []) as ProfesorBasico[])
    }
    setLoading(false)
  }, [fFecha])

  useEffect(() => {
    setLoading(true)
    void cargar()
  }, [cargar])

  // Refresco automático cada 60 s mientras la pestaña esté visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void cargar()
    }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  // ---------- Filtros sobre la tabla ----------
  const filtrados = useMemo(
    () =>
      registros.filter(
        (r) =>
          (fProfesor === 'todos' || r.profesor_id === fProfesor) &&
          (fEstado === 'todos' || r.estado === fEstado)
      ),
    [registros, fProfesor, fEstado]
  )

  function exportarCSV() {
    const encabezados = [
      'Profesor',
      'Materia',
      'Aula',
      'Fecha',
      'Hora registro',
      'Método',
      'Estado',
    ]
    const filas = filtrados.map((r) => [
      nombreCompleto(r),
      r.materia_nombre ?? '',
      r.aula_nombre ?? '',
      formatFecha(fFecha),
      formatHoraRegistro(r.hora_registro),
      r.metodo_deteccion,
      r.estado,
    ])
    const csv = [encabezados, ...filas]
      .map((fila) => fila.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    // BOM para que Excel abra acentos correctamente
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencias-${fFecha}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tarjetas = [
    { valor: kpis?.activos ?? '—', etiqueta: 'Profesores activos', color: 'text-udeg-azul' },
    { valor: kpis?.registradas_hoy ?? '—', etiqueta: 'Asistencias hoy', color: 'text-udeg-naranja' },
    {
      valor: kpis?.pct_semana == null ? '—' : `${kpis.pct_semana}%`,
      etiqueta: 'Asistencia esta semana',
      color: 'text-emerald-600',
    },
    { valor: kpis?.en_clase ?? '—', etiqueta: 'Con clase ahora', color: 'text-violet-600' },
  ]

  return (
    <AdminLayout breadcrumb={[{ label: 'Dashboard' }]}>
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Resumen de asistencia docente · se actualiza cada minuto.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-5 space-y-6">
          <SkeletonKpis count={4} />
          <SkeletonTable rows={6} cols={5} />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tarjetas.map((t) => (
              <div key={t.etiqueta} className="card text-center">
                <p className={`text-3xl font-bold ${t.color}`}>{t.valor}</p>
                <p className="mt-1 text-xs font-medium text-gray-500">{t.etiqueta}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="card mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <label htmlFor="f-fecha" className="mb-1 block text-xs font-semibold text-gray-500">
                Fecha
              </label>
              <input
                id="f-fecha"
                type="date"
                className="input !py-2"
                value={fFecha}
                onChange={(e) => setFFecha(e.target.value || hoyISO())}
              />
            </div>
            <div>
              <label
                htmlFor="f-profesor"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                Profesor
              </label>
              <select
                id="f-profesor"
                className="input !py-2"
                value={fProfesor}
                onChange={(e) => setFProfesor(e.target.value)}
              >
                <option value="todos">Todos</option>
                {profesores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.apellidos}, {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-estado" className="mb-1 block text-xs font-semibold text-gray-500">
                Estado
              </label>
              <select
                id="f-estado"
                className="input !py-2"
                value={fEstado}
                onChange={(e) => setFEstado(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="presente">Presente</option>
                <option value="tarde">Tarde</option>
                <option value="ausente">Ausente</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={exportarCSV}
                disabled={filtrados.length === 0}
                className="btn-secondary w-full !py-2.5"
              >
                <IconDownload className="h-4 w-4" />
                Exportar CSV
              </button>
            </div>
          </div>

          {/* Tabla de registros */}
          <div className="card mt-4 overflow-x-auto !p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-semibold">Profesor</th>
                  <th className="px-4 py-3 font-semibold">Materia</th>
                  <th className="px-4 py-3 font-semibold">Aula</th>
                  <th className="px-4 py-3 font-semibold">Hora registro</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {nombreCompleto(r)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.materia_nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.aula_nombre ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-600">
                        {formatHoraRegistro(r.hora_registro)}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={r.estado} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
