import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import { SkeletonTable } from '../components/Skeleton'
import { IconChart, IconUpload } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { derivarGrupo, normalizar, parseRangoHorario } from '../lib/asistencia'
import type { Grupo } from '../types'

type Fila = (string | number)[]

const HOJAS_VALIDAS = ['2026a', '2026b']

const DIAS_COL = [
  { dia: 1, alias: ['l', 'lunes'] },
  { dia: 2, alias: ['m', 'martes'] },
  { dia: 3, alias: ['i', 'miercoles'] },
  { dia: 4, alias: ['j', 'jueves'] },
  { dia: 5, alias: ['v', 'viernes'] },
]

interface Mapeo {
  codigo: number
  nombre: number
  grupo: number
  dias: number[]
}

/** Detecta las columnas necesarias por encabezado normalizado */
function detectarColumnas(cabeceras: Fila): Mapeo | null {
  const cab = cabeceras.map(normalizar)
  const buscar = (pred: (h: string) => boolean) => cab.findIndex(pred)
  const codigo = buscar((h) => h === 'codigo')
  const nombre = buscar((h) => h === 'nombre')
  const grupo = buscar(
    (h) => h === 'grupo' || h === 'gpo' || h.includes('grupo') || h.includes('seccion')
  )
  const dias = DIAS_COL.map(({ alias }) => buscar((h) => alias.includes(h)))
  // Se exige grupo, los días, y al menos código o nombre para ubicar al profesor
  if (grupo < 0 || dias.some((d) => d < 0) || (codigo < 0 && nombre < 0)) return null
  return { codigo, nombre, grupo, dias }
}

export default function AdminGrupos() {
  const { esSesionSupabase } = useAuth()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // Importación (asigna grupo sobre horarios existentes, sin borrar)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [errorImport, setErrorImport] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ actualizados: number; sinMatch: number } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_grupos')
    if (err) {
      setError('No se pudieron cargar los grupos. ¿Iniciaste sesión como administrador?')
    } else {
      setError(null)
      setGrupos((data ?? []) as Grupo[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function handleArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // permite re-seleccionar el mismo archivo
    setErrorImport(null)
    setResultado(null)

    if (!esSesionSupabase) {
      setErrorImport(
        'Tu sesión no puede escribir en la base. Cierra sesión y entra con «Acceso administrativo» (correo y contraseña).'
      )
      return
    }

    setImportando(true)
    try {
      // 1. Leer el Excel/CSV
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const esCSV = /\.csv$/i.test(file.name)
      let wb
      if (esCSV) {
        let texto = new TextDecoder('utf-8').decode(buf)
        if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
        wb = XLSX.read(texto, { type: 'string' })
      } else {
        wb = XLSX.read(buf, { type: 'array' })
      }
      const hoja =
        wb.SheetNames.find((n) => HOJAS_VALIDAS.includes(n.trim().toLowerCase())) ??
        (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null)
      if (!hoja) {
        setErrorImport(`El Excel no tiene una hoja de cargas (${HOJAS_VALIDAS.join(' o ')}).`)
        return
      }
      const data = XLSX.utils.sheet_to_json(wb.Sheets[hoja], {
        header: 1,
        raw: true,
        defval: '',
      }) as Fila[]
      const filas = data.filter((f) => f.some((c) => String(c ?? '').trim() !== ''))
      if (filas.length < 2) {
        setErrorImport('El archivo no tiene filas de datos.')
        return
      }
      const map = detectarColumnas(filas[0])
      if (!map) {
        setErrorImport(
          'No se detectaron las columnas necesarias (Grupo/Sección, los días y Código o Nombre del profesor). Verifica el archivo.'
        )
        return
      }

      // 2. Catálogos para emparejar (igual que el importador)
      const [resProf, resHor] = await Promise.all([
        supabase.from('profesores').select('id, nombre, apellidos, numero_empleado'),
        supabase
          .from('horarios')
          .select('id, profesor_id, dia_semana, hora_inicio, hora_fin')
          .eq('activo', true),
      ])
      if (resProf.error || resHor.error) {
        setErrorImport('No se pudieron cargar los horarios existentes. ¿Entraste como administrador?')
        return
      }
      const profPorCodigo = new Map<string, string>()
      const profPorNombre = new Map<string, string>()
      for (const p of resProf.data ?? []) {
        if (p.numero_empleado) profPorCodigo.set(normalizar(p.numero_empleado), p.id)
        profPorNombre.set(normalizar(`${p.nombre} ${p.apellidos}`), p.id)
        profPorNombre.set(normalizar(`${p.apellidos} ${p.nombre}`), p.id)
      }
      const clave = (pid: string, dia: number, hi: string, hf: string) => `${pid}|${dia}|${hi}|${hf}`
      const horarioPorClave = new Map<string, string>()
      for (const h of resHor.data ?? []) {
        horarioPorClave.set(clave(h.profesor_id, h.dia_semana, h.hora_inicio, h.hora_fin), h.id)
      }

      // 3. Recorrer las filas y armar {horario_id → grupo}
      const asignaciones = new Map<string, string>()
      let sinMatch = 0
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i]
        const grupo = derivarGrupo(fila[map.grupo])
        if (!grupo) continue
        const codigo = map.codigo >= 0 ? String(fila[map.codigo] ?? '').trim() : ''
        const nombre = map.nombre >= 0 ? String(fila[map.nombre] ?? '').trim() : ''
        const profesorId =
          (codigo ? profPorCodigo.get(normalizar(codigo)) : undefined) ??
          (nombre ? profPorNombre.get(normalizar(nombre)) : undefined) ??
          null
        if (!profesorId) continue

        for (let d = 0; d < DIAS_COL.length; d++) {
          const texto = String(fila[map.dias[d]] ?? '').trim()
          if (!texto) continue
          const rango = parseRangoHorario(texto)
          if (!rango) continue
          const hid = horarioPorClave.get(clave(profesorId, DIAS_COL[d].dia, rango.inicio, rango.fin))
          if (hid) asignaciones.set(hid, grupo)
          else sinMatch++
        }
      }

      if (asignaciones.size === 0) {
        setErrorImport(
          'No se pudo emparejar ninguna clase con los horarios ya cargados. ¿Corresponde el archivo al ciclo importado?'
        )
        return
      }

      // 4. Aplicar (solo actualiza la columna grupo)
      const payload = [...asignaciones].map(([horario_id, grupo]) => ({ horario_id, grupo }))
      const { data: total, error: errRpc } = await supabase.rpc('set_grupos_horarios', {
        p_asignaciones: payload,
      })
      if (errRpc) {
        setErrorImport(`No se pudieron asignar los grupos: ${errRpc.message}`)
        return
      }
      setNombreArchivo(file.name)
      setResultado({ actualizados: (total as number) ?? 0, sinMatch })
      toast.success(`${(total as number) ?? 0} clase(s) actualizada(s) con su grupo.`)
      await cargar()
    } catch {
      setErrorImport('No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv válido.')
    } finally {
      setImportando(false)
    }
  }

  const filtrados = grupos.filter((g) =>
    g.grupo.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  return (
    <AdminLayout breadcrumb={[{ label: 'Grupos' }]}>
      <h1 className="text-xl font-bold text-gray-900">Grupos</h1>
      <p className="mt-1 text-sm text-gray-500">
        Grupos de alumnos y su horario semanal. Toca un grupo para verlo e imprimirlo.
      </p>

      {/* Rescatar/asignar grupos desde el Excel (sin borrar nada) */}
      <section className="card mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Rescatar grupos desde el Excel
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Sube el mismo archivo de cargas (con la columna «Grupo/Sección»). Se asigna el grupo a
          los horarios que <span className="font-semibold">ya existen</span> —emparejando por
          profesor, día y hora— sin borrar ni duplicar nada. Tus asistencias no se tocan.
        </p>

        {!esSesionSupabase && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            ⚠️ Entraste con código + NIP: esta sesión no puede escribir. Entra con «Acceso
            administrativo» (correo y contraseña).
          </p>
        )}

        <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center transition-colors hover:border-udeg-naranja">
          <IconUpload className="h-7 w-7 text-udeg-naranja" />
          <span className="text-sm font-semibold text-gray-700">
            {importando ? 'Procesando…' : nombreArchivo || 'Selecciona el archivo de cargas'}
          </span>
          <span className="text-xs text-gray-400">.xlsx, .xls o .csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={importando}
            onChange={handleArchivo}
          />
        </label>

        {errorImport && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {errorImport}
          </p>
        )}
        {resultado && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Se asignó grupo a {resultado.actualizados} clase(s).
            {resultado.sinMatch > 0 &&
              ` (${resultado.sinMatch} del archivo no coincidieron con un horario cargado.)`}
          </p>
        )}
      </section>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={6} cols={2} />
        </div>
      ) : grupos.length === 0 ? (
        <p className="card mt-4 text-sm text-gray-600">
          Aún no hay grupos asignados. Sube el Excel de cargas arriba para rescatarlos.
        </p>
      ) : (
        <>
          <div className="mt-6 max-w-xs">
            <input
              type="text"
              className="input !py-2"
              placeholder="Buscar grupo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtrados.map((g) => (
              <Link
                key={g.grupo}
                to={`/admin/grupo/${encodeURIComponent(g.grupo)}`}
                className="card flex flex-col items-center gap-1 text-center transition-colors hover:border-udeg-naranja"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-udeg-azul-light">
                  <IconChart className="h-5 w-5 text-udeg-azul" />
                </span>
                <p className="mt-1 text-lg font-bold text-gray-900">{g.grupo}</p>
                <p className="text-xs text-gray-500">
                  {g.clases} {g.clases === 1 ? 'clase' : 'clases'}
                </p>
              </Link>
            ))}
            {filtrados.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-gray-500">
                Ningún grupo coincide con «{busqueda}».
              </p>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  )
}
