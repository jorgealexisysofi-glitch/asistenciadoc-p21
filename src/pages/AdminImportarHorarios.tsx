import { useMemo, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { IconTrash, IconUpload } from '../components/icons'
import { supabase } from '../lib/supabase'
import { normalizar, parseRangoHorario } from '../lib/asistencia'

type Fila = (string | number)[]

/** Nombres de hoja aceptados (ciclo A o B), sin distinguir mayúsculas */
const HOJAS_VALIDAS = ['2026a', '2026b']

/** Devuelve el nombre real de la hoja de cargas dentro del libro, o null */
function encontrarHoja(nombres: string[]): string | null {
  return (
    nombres.find((n) => HOJAS_VALIDAS.includes(n.trim().toLowerCase())) ?? null
  )
}

/** Columnas L,M,I,J,V → día de la semana 1..5 */
const DIAS: { col: 'L' | 'M' | 'I' | 'J' | 'V'; dia: number }[] = [
  { col: 'L', dia: 1 },
  { col: 'M', dia: 2 },
  { col: 'I', dia: 3 },
  { col: 'J', dia: 4 },
  { col: 'V', dia: 5 },
]

interface Mapeo {
  codigo: number
  nombre: number
  materia: number
  cve: number
  dias: Record<'L' | 'M' | 'I' | 'J' | 'V', number>
}

interface Catalogo {
  profesores: { id: string; nombre: string; apellidos: string; numero_empleado: string | null }[]
}

/** Detecta las columnas por encabezado normalizado (devuelve null si falta alguna) */
function detectarColumnas(cabeceras: Fila): Mapeo | null {
  const cab = cabeceras.map(normalizar)
  const buscar = (pred: (h: string) => boolean) => cab.findIndex(pred)
  const codigo = buscar((h) => h === 'codigo')
  const nombre = buscar((h) => h === 'nombre')
  const materia = buscar((h) => h === 'materia')
  const cve = buscar((h) => h === 'cve materia' || (h.includes('cve') && h.includes('materia')))
  const dias = {
    L: buscar((h) => h === 'l'),
    M: buscar((h) => h === 'm'),
    I: buscar((h) => h === 'i'),
    J: buscar((h) => h === 'j'),
    V: buscar((h) => h === 'v'),
  }
  if (
    codigo < 0 ||
    nombre < 0 ||
    materia < 0 ||
    Object.values(dias).some((d) => d < 0)
  ) {
    return null
  }
  return { codigo, nombre, materia, cve, dias }
}

export default function AdminImportarHorarios() {
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [filas, setFilas] = useState<Fila[]>([])
  const [mapeo, setMapeo] = useState<Mapeo | null>(null)
  const [semestre, setSemestre] = useState('2026-A')
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<{
    importados: number
    errores: string[]
  } | null>(null)
  const [verErrores, setVerErrores] = useState(false)

  // Limpiar horario: 0 cerrado, 1 primera confirmación, 2 escribir ELIMINAR
  const [limpiarPaso, setLimpiarPaso] = useState<0 | 1 | 2>(0)
  const [textoConfirmar, setTextoConfirmar] = useState('')
  const [limpiando, setLimpiando] = useState(false)

  const encabezados = filas[0] ?? []
  const columnas = useMemo(
    () => encabezados.map((h, i) => ({ indice: i, etiqueta: String(h ?? '').trim() || `Col ${i + 1}` })),
    [encabezados]
  )

  async function handleArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorArchivo(null)
    setResultado(null)
    setMapeo(null)
    setFilas([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const hoja = encontrarHoja(wb.SheetNames)
      if (!hoja) {
        setErrorArchivo(
          `El archivo no tiene una hoja de cargas (${HOJAS_VALIDAS.join(' o ')}).`
        )
        return
      }
      const ws = wb.Sheets[hoja]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Fila[]
      const noVacias = data.filter((f) => f.some((c) => String(c ?? '').trim() !== ''))
      if (noVacias.length < 2) {
        setErrorArchivo('La hoja no tiene filas de datos.')
        return
      }
      const map = detectarColumnas(noVacias[0])
      if (!map) {
        setErrorArchivo(
          'No se detectaron las columnas esperadas (Código, Nombre, Materia y L/M/I/J/V). Verifica la hoja.'
        )
        return
      }
      setNombreArchivo(file.name)
      setFilas(noVacias)
      setMapeo(map)
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Verifica que sea un .xlsx o .xls válido.')
    }
  }

  async function procesar() {
    if (!mapeo) return
    setProcesando(true)
    setResultado(null)
    setVerErrores(false)

    // Profesores y materias (una consulta cada uno)
    const [resProf, resMaterias] = await Promise.all([
      supabase.from('profesores').select('id, nombre, apellidos, numero_empleado'),
      supabase.from('materias').select('id, nombre, clave'),
    ])
    if (resProf.error || resMaterias.error) {
      toast.error('No se pudieron cargar los catálogos. ¿Iniciaste sesión como administrador?')
      setProcesando(false)
      return
    }

    const cat: Catalogo = { profesores: resProf.data ?? [] }
    const materiaPorClave = new Map<string, string>()
    const materiaPorNombre = new Map<string, string>()
    for (const m of resMaterias.data ?? []) {
      if (m.clave) materiaPorClave.set(normalizar(m.clave), m.id)
      materiaPorNombre.set(normalizar(m.nombre), m.id)
    }

    const errores: string[] = []
    const aInsertar: {
      profesor_id: string
      materia_id: string
      aula_id: null
      dia_semana: number
      hora_inicio: string
      hora_fin: string
      semestre: string
    }[] = []

    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i]
      const nFila = i + 1
      if (fila.every((c) => String(c ?? '').trim() === '')) continue

      const codigo = String(fila[mapeo.codigo] ?? '').trim()
      const nombre = String(fila[mapeo.nombre] ?? '').trim()

      // ¿Tiene esta fila algún día con horario? Si no, se ignora en silencio.
      const conDias = DIAS.filter(
        ({ col }) => String(fila[mapeo.dias[col]] ?? '').trim() !== ''
      )
      if (conDias.length === 0) continue

      // Profesor: por Código (numero_empleado) y, si no, por Nombre
      const profesor = buscarProfesor(cat, codigo, nombre)
      if (!profesor) {
        errores.push(`Fila ${nFila}: profesor «${nombre || codigo || '—'}» no encontrado.`)
        continue
      }

      // Materia: por clave, luego por nombre; crear si no existe
      const materiaNombre = String(fila[mapeo.materia] ?? '').trim()
      const cve = String(fila[mapeo.cve] ?? '').trim()
      if (!materiaNombre) {
        errores.push(`Fila ${nFila}: falta la materia.`)
        continue
      }
      let materiaId =
        (cve ? materiaPorClave.get(normalizar(cve)) : undefined) ??
        materiaPorNombre.get(normalizar(materiaNombre))
      if (!materiaId) {
        const { data, error } = await supabase
          .from('materias')
          .insert({ nombre: materiaNombre, clave: cve || null })
          .select('id')
          .single()
        if (error || !data) {
          errores.push(`Fila ${nFila}: no se pudo crear la materia «${materiaNombre}».`)
          continue
        }
        materiaId = data.id as string
        if (cve) materiaPorClave.set(normalizar(cve), materiaId)
        materiaPorNombre.set(normalizar(materiaNombre), materiaId)
      }

      // Un horario por cada día con contenido
      for (const { col, dia } of conDias) {
        const texto = String(fila[mapeo.dias[col]] ?? '').trim()
        const rango = parseRangoHorario(texto)
        if (!rango) {
          errores.push(`Fila ${nFila} (${col}): horario «${texto}» mal formado.`)
          continue
        }
        aInsertar.push({
          profesor_id: profesor.id,
          materia_id: materiaId,
          aula_id: null,
          dia_semana: dia,
          hora_inicio: rango.inicio,
          hora_fin: rango.fin,
          semestre: semestre.trim() || '2026-A',
        })
      }
    }

    // Inserción por lotes (más rápido que fila por fila)
    let importados = 0
    const TAM = 100
    for (let i = 0; i < aInsertar.length; i += TAM) {
      const lote = aInsertar.slice(i, i + TAM)
      const { error } = await supabase.from('horarios').insert(lote)
      if (error) {
        errores.push(`Lote ${i / TAM + 1}: no se pudo insertar (${error.message}).`)
      } else {
        importados += lote.length
      }
    }

    setResultado({ importados, errores })
    setProcesando(false)
    if (importados > 0) toast.success(`${importados} horario(s) importado(s).`)
  }

  async function confirmarLimpiar() {
    setLimpiando(true)
    const { error } = await supabase
      .from('horarios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    setLimpiando(false)
    if (error) {
      toast.error('No se pudieron eliminar los horarios.')
      return
    }
    toast.success('Todos los horarios fueron eliminados')
    setLimpiarPaso(0)
    setTextoConfirmar('')
  }

  const hayDatos = filas.length > 1 && mapeo != null

  return (
    <AdminLayout breadcrumb={[{ label: 'Importar horarios' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Importar horarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sube el Excel de cargas (hoja «{HOJAS_VALIDAS.join('» o «')}»). Las aulas se
            asignan después en{' '}
            <span className="font-semibold">Asignar aulas</span>.
          </p>
        </div>
        <button
          onClick={() => setLimpiarPaso(1)}
          className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
        >
          <IconTrash className="mr-1.5 inline h-4 w-4" />
          Limpiar horario completo
        </button>
      </div>

      <div className="card mt-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center transition-colors hover:border-udeg-naranja">
          <IconUpload className="h-8 w-8 text-udeg-naranja" />
          <span className="text-sm font-semibold text-gray-700">
            {nombreArchivo || 'Selecciona el archivo Excel'}
          </span>
          <span className="text-xs text-gray-400">.xlsx o .xls</span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivo} />
        </label>
        {errorArchivo && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {errorArchivo}
          </p>
        )}
      </div>

      {hayDatos && mapeo && (
        <>
          {/* Columnas detectadas */}
          <section className="card mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Columnas detectadas
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(
                [
                  ['Código', mapeo.codigo],
                  ['Nombre', mapeo.nombre],
                  ['Materia', mapeo.materia],
                  ['Cve. Materia', mapeo.cve],
                  ...DIAS.map(({ col }) => [`Día ${col}`, mapeo.dias[col]]),
                ] as [string, number][]
              ).map(([etq, idx]) => (
                <span
                  key={etq}
                  className="rounded-full bg-udeg-azul-light px-2.5 py-1 font-semibold text-udeg-azul"
                >
                  {etq}: {idx >= 0 ? columnas[idx]?.etiqueta : '—'}
                </span>
              ))}
            </div>
            <div className="mt-4 max-w-xs">
              <label htmlFor="semestre" className="mb-1 block text-xs font-semibold text-gray-500">
                Ciclo / semestre
              </label>
              <input
                id="semestre"
                type="text"
                className="input !py-2"
                value={semestre}
                onChange={(e) => setSemestre(e.target.value)}
              />
            </div>
            <button onClick={() => void procesar()} disabled={procesando} className="btn-primary mt-4">
              {procesando ? 'Procesando…' : 'Procesar e importar'}
            </button>
          </section>

          {/* Vista previa */}
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Vista previa (primeras 5 filas)
            </h2>
            <div className="card overflow-x-auto !p-0">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    {columnas.map((c) => (
                      <th key={c.indice} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {c.etiqueta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(1, 6).map((fila, ri) => (
                    <tr key={ri} className="border-b border-gray-50 last:border-0">
                      {columnas.map((c) => (
                        <td key={c.indice} className="whitespace-nowrap px-3 py-2 text-gray-600">
                          {String(fila[c.indice] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Resultado */}
      {resultado && (
        <section className="card mt-6">
          <p className="text-sm font-semibold text-gray-800">
            <span className="text-emerald-600">{resultado.importados}</span> horario(s)
            importado(s) (todos <span className="text-amber-600">pendientes de aula</span>),{' '}
            <span className="text-red-600">{resultado.errores.length}</span> omitido(s) por errores.
          </p>
          {resultado.importados > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Asigna las aulas en la sección «Asignar aulas».
            </p>
          )}
          {resultado.errores.length > 0 && (
            <>
              <button
                onClick={() => setVerErrores((v) => !v)}
                className="mt-2 text-sm font-semibold text-udeg-azul hover:underline"
              >
                {verErrores ? 'Ocultar' : 'Ver'} detalle de errores
              </button>
              {verErrores && (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg bg-fondo p-3 text-xs text-red-700">
                  {resultado.errores.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {/* Modal limpiar — paso 1 */}
      <Modal open={limpiarPaso === 1} title="Limpiar horario completo" onClose={() => setLimpiarPaso(0)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            ¿Eliminar <span className="font-semibold">TODOS</span> los horarios actuales? Esta acción
            no afecta los registros de asistencia históricos.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setLimpiarPaso(0)} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button
              onClick={() => setLimpiarPaso(2)}
              className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Continuar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal limpiar — paso 2 */}
      <Modal
        open={limpiarPaso === 2}
        title="Confirmación final"
        onClose={() => {
          setLimpiarPaso(0)
          setTextoConfirmar('')
        }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Para confirmar, escribe{' '}
            <span className="font-mono font-bold text-red-600">ELIMINAR</span> en el campo:
          </p>
          <input
            type="text"
            className="input"
            placeholder="ELIMINAR"
            value={textoConfirmar}
            onChange={(e) => setTextoConfirmar(e.target.value)}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLimpiarPaso(0)
                setTextoConfirmar('')
              }}
              disabled={limpiando}
              className="btn-ghost flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarLimpiar()}
              disabled={limpiando || textoConfirmar !== 'ELIMINAR'}
              className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {limpiando ? 'Eliminando…' : 'Eliminar todo'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

/** Profesor por número de empleado (Código) y, si no coincide, por nombre completo */
function buscarProfesor(
  cat: Catalogo,
  codigo: string,
  nombre: string
): Catalogo['profesores'][number] | null {
  const cod = normalizar(codigo)
  if (cod) {
    const porCodigo = cat.profesores.find((p) => normalizar(p.numero_empleado) === cod)
    if (porCodigo) return porCodigo
  }
  const nom = normalizar(nombre)
  if (!nom) return null
  const coincidencias = cat.profesores.filter((p) => {
    const a = normalizar(`${p.nombre} ${p.apellidos}`)
    const b = normalizar(`${p.apellidos} ${p.nombre}`)
    return a === nom || b === nom || a.includes(nom) || nom.includes(a)
  })
  return coincidencias.length === 1 ? coincidencias[0] : null
}
