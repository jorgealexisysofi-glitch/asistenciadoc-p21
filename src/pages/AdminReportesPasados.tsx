import { useEffect, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { IconTrash, IconUpload } from '../components/icons'

const CLAVE_LS = 'asistenciadoc:reportes-pasados'

interface ReportePasado {
  id: string
  nombre: string
  periodo: string
  importado: string
  resumen: string[][]
  detalle: string[][]
}

function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function leerLS(): ReportePasado[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_LS) ?? '[]') as ReportePasado[]
  } catch {
    return []
  }
}

/** Extrae una tabla de un arreglo de filas: desde el encabezado (cuya 1ª celda
 *  es `primeraCol`) hasta el final, omitiendo filas totalmente vacías. */
function extraerTabla(aoa: string[][], primeraCol: string): string[][] {
  const hi = aoa.findIndex((r) => String(r[0] ?? '').trim().toLowerCase() === primeraCol)
  if (hi < 0) return []
  const out: string[][] = []
  for (let i = hi; i < aoa.length; i++) {
    const row = (aoa[i] ?? []).map((c) => String(c ?? ''))
    if (i > hi && row.every((c) => c.trim() === '')) continue
    out.push(row)
  }
  return out
}

export default function AdminReportesPasados() {
  const [reportes, setReportes] = useState<ReportePasado[]>(() => leerLS())
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_LS, JSON.stringify(reportes))
    } catch {
      toast.error('No se pudo guardar (memoria del navegador llena). Borra reportes viejos.')
    }
  }, [reportes])

  async function importar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const hoja = (claves: string[]) => {
        const n = wb.SheetNames.find((s) => claves.some((k) => s.toLowerCase().includes(k)))
        return n ? wb.Sheets[n] : null
      }
      const wsR = hoja(['resumen']) ?? wb.Sheets[wb.SheetNames[0]]
      const wsD = hoja(['detalle'])
      const aoaR = XLSX.utils.sheet_to_json(wsR, { header: 1, raw: false, defval: '' }) as string[][]
      const aoaD = wsD
        ? (XLSX.utils.sheet_to_json(wsD, { header: 1, raw: false, defval: '' }) as string[][])
        : []

      const resumen = extraerTabla(aoaR, 'profesor')
      const detalle = extraerTabla(aoaD, 'fecha')
      if (resumen.length === 0 && detalle.length === 0) {
        toast.error('No parece un reporte de asistencia válido (falta la hoja Resumen o Detalle).')
        return
      }
      let periodo = ''
      for (const r of aoaR) {
        const c = String(r[0] ?? '')
        if (c.toLowerCase().startsWith('periodo')) { periodo = c.replace(/^periodo:\s*/i, '') ; break }
      }

      const rep: ReportePasado = {
        id: nuevoId(),
        nombre: file.name.replace(/\.xlsx?$/i, ''),
        periodo,
        importado: new Date().toISOString(),
        resumen,
        detalle,
      }
      setReportes((prev) => [rep, ...prev])
      setAbierto(rep.id)
      toast.success('Reporte importado.')
    } catch {
      toast.error('No se pudo leer el archivo. ¿Es un .xlsx de reportes?')
    }
  }

  function borrar(id: string) {
    setReportes((prev) => prev.filter((r) => r.id !== id))
    if (abierto === id) setAbierto(null)
  }

  const activo = reportes.find((r) => r.id === abierto) ?? null

  return (
    <AdminLayout breadcrumb={[{ label: 'Reportes pasados' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes pasados</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sube un reporte que descargaste antes para verlo aquí. Se guarda en este navegador; no
            afecta la base de datos.
          </p>
        </div>
        <label className="btn-primary cursor-pointer">
          <IconUpload className="h-4 w-4" />
          Importar reporte (.xlsx)
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
        </label>
      </div>

      {reportes.length === 0 ? (
        <p className="card mt-5 text-sm text-gray-600">
          Aún no has importado reportes. Usa <span className="font-semibold">Importar reporte</span>{' '}
          y sube un archivo descargado desde la sección Reportes.
        </p>
      ) : (
        <>
          {/* Lista de reportes importados */}
          <div className="mt-5 flex flex-col gap-2">
            {reportes.map((r) => (
              <div
                key={r.id}
                className={`card flex flex-wrap items-center justify-between gap-3 ${
                  abierto === r.id ? 'border-udeg-naranja' : ''
                }`}
              >
                <button onClick={() => setAbierto(abierto === r.id ? null : r.id)} className="min-w-0 text-left">
                  <p className="truncate font-semibold text-gray-800">{r.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {r.periodo ? `Periodo ${r.periodo} · ` : ''}
                    {r.resumen.length > 1 ? `${r.resumen.length - 1} profesor(es) · ` : ''}
                    importado {new Date(r.importado).toLocaleDateString('es-MX')}
                  </p>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAbierto(abierto === r.id ? null : r.id)}
                    className="btn-ghost !py-2 text-sm"
                  >
                    {abierto === r.id ? 'Ocultar' : 'Ver'}
                  </button>
                  <button
                    onClick={() => borrar(r.id)}
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    aria-label="Borrar reporte"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Visor del reporte seleccionado */}
          {activo && (
            <div className="mt-6 space-y-6">
              {activo.resumen.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                    Resumen
                  </h2>
                  <TablaReporte rows={activo.resumen} minW={820} />
                </section>
              )}
              {activo.detalle.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                    Detalle por clase
                  </h2>
                  <TablaReporte rows={activo.detalle} minW={980} />
                </section>
              )}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  )
}

/** Renderiza una tabla genérica: primera fila = encabezados */
function TablaReporte({ rows, minW }: { rows: string[][]; minW: number }) {
  if (rows.length === 0) return null
  const [head, ...body] = rows
  return (
    <div className="card overflow-x-auto !p-0">
      <table className="w-full text-left text-sm" style={{ minWidth: minW }}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((fila, ri) => {
            const esTotal = String(fila[0] ?? '').trim().toUpperCase() === 'TOTAL'
            return (
              <tr key={ri} className={`border-b border-gray-50 last:border-0 ${esTotal ? 'bg-udeg-azul-light font-semibold text-udeg-azul' : ''}`}>
                {head.map((_, ci) => (
                  <td key={ci} className="whitespace-nowrap px-3 py-2 text-gray-700">{fila[ci] ?? ''}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
