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

type ColDia = 'L' | 'M' | 'I' | 'J' | 'V'

/** Cada día acepta la inicial (L,M,I,J,V) o el nombre completo (LUNES…VIERNES) */
const DIAS: { col: ColDia; dia: number; alias: string[] }[] = [
  { col: 'L', dia: 1, alias: ['l', 'lunes'] },
  { col: 'M', dia: 2, alias: ['m', 'martes'] },
  { col: 'I', dia: 3, alias: ['i', 'miercoles'] },
  { col: 'J', dia: 4, alias: ['j', 'jueves'] },
  { col: 'V', dia: 5, alias: ['v', 'viernes'] },
]

interface Mapeo {
  codigo: number
  nombre: number
  materia: number
  cve: number
  /** -1 si el archivo no trae columna de aula */
  aula: number
  dias: Record<ColDia, number>
}

interface Catalogo {
  profesores: { id: string; nombre: string; apellidos: string; numero_empleado: string | null }[]
  aulas: { id: string; nombre: string; beacon_id: string | null }[]
}

/** Detecta las columnas por encabezado normalizado (devuelve null si falta alguna) */
function detectarColumnas(cabeceras: Fila): Mapeo | null {
  const cab = cabeceras.map(normalizar)
  const buscar = (pred: (h: string) => boolean) => cab.findIndex(pred)
  const codigo = buscar((h) => h === 'codigo')
  const nombre = buscar((h) => h === 'nombre')
  const materia = buscar((h) => h === 'materia')
  const cve = buscar((h) => h === 'cve materia' || (h.includes('cve') && h.includes('materia')))
  const aula = buscar((h) => h === 'aula')
  const dias = {
    L: buscar((h) => DIAS[0].alias.includes(h)),
    M: buscar((h) => DIAS[1].alias.includes(h)),
    I: buscar((h) => DIAS[2].alias.includes(h)),
    J: buscar((h) => DIAS[3].alias.includes(h)),
    V: buscar((h) => DIAS[4].alias.includes(h)),
  }
  if (
    codigo < 0 ||
    nombre < 0 ||
    materia < 0 ||
    Object.values(dias).some((d) => d < 0)
  ) {
    return null
  }
  return { codigo, nombre, materia, cve, aula, dias }
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
    conAula: number
    profesoresCreados: number
    aulasCreadas: number
    errores: string[]
  } | null>(null)
  const [verErrores, setVerErrores] = useState(false)

  // Limpiar horario: 0 cerrado, 1 primera confirmación, 2 escribir ELIMINAR
  const [destructivo, setDestructivo] = useState<{
    tipo: 'horarios' | 'maestros'
    paso: 1 | 2
  } | null>(null)
  const [textoConfirmar, setTextoConfirmar] = useState('')
  const [borrando, setBorrando] = useState(false)

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
      const esCSV = /\.csv$/i.test(file.name)

      let wb
      if (esCSV) {
        // Los CSV suelen venir en Windows-1252 (acentos como un solo byte); si
        // UTF-8 deja el carácter de reemplazo, se reintenta con Windows-1252.
        let texto = new TextDecoder('utf-8').decode(buf)
        if (texto.includes('�')) {
          texto = new TextDecoder('windows-1252').decode(buf)
        }
        wb = XLSX.read(texto, { type: 'string' })
      } else {
        wb = XLSX.read(buf, { type: 'array' })
      }

      // Excel con varias hojas → exige "2026a"/"2026b"; CSV (hoja única) → la usa
      const hoja =
        encontrarHoja(wb.SheetNames) ??
        (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null)
      if (!hoja) {
        setErrorArchivo(
          `El Excel no tiene una hoja de cargas (${HOJAS_VALIDAS.join(' o ')}).`
        )
        return
      }
      const ws = wb.Sheets[hoja]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Fila[]
      const noVacias = data.filter((f) => f.some((c) => String(c ?? '').trim() !== ''))
      if (noVacias.length < 2) {
        setErrorArchivo('El archivo no tiene filas de datos.')
        return
      }
      const map = detectarColumnas(noVacias[0])
      if (!map) {
        setErrorArchivo(
          'No se detectaron las columnas esperadas (Código, Nombre, Materia y los días L/M/I/J/V o LUNES…VIERNES). Verifica el archivo.'
        )
        return
      }
      setNombreArchivo(file.name)
      setFilas(noVacias)
      setMapeo(map)
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv válido.')
    }
  }

  async function procesar() {
    if (!mapeo) return
    setProcesando(true)
    setResultado(null)
    setVerErrores(false)

    // Profesores, aulas y materias (una consulta cada uno)
    const [resProf, resAulas, resMaterias] = await Promise.all([
      supabase.from('profesores').select('id, nombre, apellidos, numero_empleado'),
      supabase.from('aulas').select('id, nombre, beacon_id'),
      supabase.from('materias').select('id, nombre, clave'),
    ])
    if (resProf.error || resAulas.error || resMaterias.error) {
      toast.error('No se pudieron cargar los catálogos. ¿Iniciaste sesión como administrador?')
      setProcesando(false)
      return
    }

    const cat: Catalogo = { profesores: resProf.data ?? [], aulas: resAulas.data ?? [] }
    const materiaPorClave = new Map<string, string>()
    const materiaPorNombre = new Map<string, string>()
    for (const m of resMaterias.data ?? []) {
      if (m.clave) materiaPorClave.set(normalizar(m.clave), m.id)
      materiaPorNombre.set(normalizar(m.nombre), m.id)
    }
    // Caché de aulas (nombre y beacon → id); se va llenando si se crean nuevas
    const aulaPorNombre = new Map<string, string>()
    for (const a of cat.aulas) {
      aulaPorNombre.set(normalizar(a.nombre), a.id)
      if (a.beacon_id) aulaPorNombre.set(normalizar(a.beacon_id), a.id)
    }
    // Caché de profesores por código y por nombre completo (ambos órdenes)
    const profPorCodigo = new Map<string, string>()
    const profPorNombre = new Map<string, string>()
    for (const p of cat.profesores) {
      if (p.numero_empleado) profPorCodigo.set(normalizar(p.numero_empleado), p.id)
      profPorNombre.set(normalizar(`${p.nombre} ${p.apellidos}`), p.id)
      profPorNombre.set(normalizar(`${p.apellidos} ${p.nombre}`), p.id)
    }

    const errores: string[] = []
    let conAula = 0
    let profesoresCreados = 0
    let aulasCreadas = 0
    const aInsertar: {
      profesor_id: string
      materia_id: string
      aula_id: string | null
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

      // Profesor: por Código (numero_empleado) o por Nombre; si no existe, se crea
      let profesorId =
        (codigo ? profPorCodigo.get(normalizar(codigo)) : undefined) ??
        (nombre ? profPorNombre.get(normalizar(nombre)) : undefined) ??
        null
      if (!profesorId) {
        if (!nombre) {
          errores.push(`Fila ${nFila}: sin nombre ni coincidencia, no se pudo crear el profesor.`)
          continue
        }
        const { nombre: nom, apellidos: ape } = partirNombre(nombre)
        const { data, error } = await supabase
          .from('profesores')
          .insert({ nombre: nom, apellidos: ape, numero_empleado: codigo || null })
          .select('id')
          .single()
        if (error || !data) {
          errores.push(`Fila ${nFila}: no se pudo crear el profesor «${nombre}».`)
          continue
        }
        profesorId = data.id as string
        profesoresCreados++
        if (codigo) profPorCodigo.set(normalizar(codigo), profesorId)
        profPorNombre.set(normalizar(nombre), profesorId)
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

      // Aula: si el archivo trae la columna, se busca; si no existe, se CREA
      // (sin beacon). Queda null solo si la fila no trae aula.
      const aulaTexto = mapeo.aula >= 0 ? String(fila[mapeo.aula] ?? '').trim() : ''
      let aulaId: string | null = null
      if (aulaTexto) {
        aulaId = aulaPorNombre.get(normalizar(aulaTexto)) ?? null
        if (!aulaId) {
          const { data, error } = await supabase
            .from('aulas')
            .insert({ nombre: aulaTexto })
            .select('id')
            .single()
          if (error || !data) {
            errores.push(`Fila ${nFila}: no se pudo crear el aula «${aulaTexto}».`)
          } else {
            aulaId = data.id as string
            aulasCreadas++
            aulaPorNombre.set(normalizar(aulaTexto), aulaId)
          }
        }
      }

      // Un horario por cada día con contenido
      for (const { col, dia } of conDias) {
        const texto = String(fila[mapeo.dias[col]] ?? '').trim()
        const rango = parseRangoHorario(texto)
        if (!rango) {
          errores.push(`Fila ${nFila} (${col}): horario «${texto}» mal formado.`)
          continue
        }
        if (aulaId) conAula++
        aInsertar.push({
          profesor_id: profesorId,
          materia_id: materiaId,
          aula_id: aulaId,
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

    setResultado({
      importados,
      conAula: Math.min(conAula, importados),
      profesoresCreados,
      aulasCreadas,
      errores,
    })
    setProcesando(false)
    if (importados > 0) toast.success(`${importados} horario(s) importado(s).`)
  }

  function cerrarDestructivo() {
    setDestructivo(null)
    setTextoConfirmar('')
  }

  async function confirmarDestructivo() {
    if (!destructivo) return
    setBorrando(true)
    if (destructivo.tipo === 'horarios') {
      const { error } = await supabase
        .from('horarios')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      setBorrando(false)
      if (error) {
        toast.error('No se pudieron eliminar los horarios.')
        return
      }
      toast.success('Todos los horarios fueron eliminados')
    } else {
      // Solo maestros sin cuenta de Auth y sin rol admin (no toca administradores).
      // Al borrarlos, la cascada elimina también sus horarios y registros.
      const { error } = await supabase
        .from('profesores')
        .delete()
        .is('user_id', null)
        .eq('admin', false)
      setBorrando(false)
      if (error) {
        toast.error('No se pudieron eliminar los maestros.')
        return
      }
      toast.success('Maestros eliminados (los administradores se conservan)')
    }
    cerrarDestructivo()
  }

  const hayDatos = filas.length > 1 && mapeo != null

  return (
    <AdminLayout breadcrumb={[{ label: 'Importar horarios' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Importar horarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sube el archivo de cargas (Excel con hoja «{HOJAS_VALIDAS.join('» o «')}», o
            CSV). Si trae columna de aula se asigna sola; el resto queda en{' '}
            <span className="font-semibold">Asignar aulas</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDestructivo({ tipo: 'maestros', paso: 1 })}
            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <IconTrash className="mr-1.5 inline h-4 w-4" />
            Borrar maestros
          </button>
          <button
            onClick={() => setDestructivo({ tipo: 'horarios', paso: 1 })}
            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <IconTrash className="mr-1.5 inline h-4 w-4" />
            Limpiar horario completo
          </button>
        </div>
      </div>

      <div className="card mt-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center transition-colors hover:border-udeg-naranja">
          <IconUpload className="h-8 w-8 text-udeg-naranja" />
          <span className="text-sm font-semibold text-gray-700">
            {nombreArchivo || 'Selecciona el archivo de cargas'}
          </span>
          <span className="text-xs text-gray-400">.xlsx, .xls o .csv</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleArchivo}
          />
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
                  ['Aula', mapeo.aula],
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
            importado(s): <span className="text-udeg-azul">{resultado.conAula}</span> con aula,{' '}
            <span className="text-amber-600">
              {resultado.importados - resultado.conAula}
            </span>{' '}
            pendiente(s) de aula.{' '}
            <span className="text-red-600">{resultado.errores.length}</span> omitido(s) por errores.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Se crearon{' '}
            <span className="font-semibold text-gray-700">{resultado.profesoresCreados}</span>{' '}
            maestro(s) y{' '}
            <span className="font-semibold text-gray-700">{resultado.aulasCreadas}</span> aula(s)
            nuevas. Los maestros entran con su número de empleado y NIP inicial{' '}
            <span className="font-mono">2126</span>.
          </p>
          {resultado.importados - resultado.conAula > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Asigna las aulas faltantes en la sección «Asignar aulas».
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

      {/* Modal destructivo — paso 1 */}
      <Modal
        open={destructivo?.paso === 1}
        title={destructivo?.tipo === 'maestros' ? 'Borrar maestros' : 'Limpiar horario completo'}
        onClose={cerrarDestructivo}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            {destructivo?.tipo === 'maestros' ? (
              <>
                ¿Eliminar <span className="font-semibold">TODOS</span> los maestros? Esto también
                borra sus horarios y registros de asistencia. <span className="font-semibold">
                  No afecta a los administradores.
                </span>
              </>
            ) : (
              <>
                ¿Eliminar <span className="font-semibold">TODOS</span> los horarios actuales? Esta
                acción no afecta los registros de asistencia históricos.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <button onClick={cerrarDestructivo} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button
              onClick={() => setDestructivo((d) => (d ? { ...d, paso: 2 } : d))}
              className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Continuar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal destructivo — paso 2 */}
      <Modal open={destructivo?.paso === 2} title="Confirmación final" onClose={cerrarDestructivo}>
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
            <button onClick={cerrarDestructivo} disabled={borrando} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button
              onClick={() => void confirmarDestructivo()}
              disabled={borrando || textoConfirmar !== 'ELIMINAR'}
              className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {borrando ? 'Eliminando…' : 'Eliminar todo'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

/**
 * Parte un nombre completo en nombre(s) + apellidos.
 * Heurística para nombres mexicanos: las últimas 2 palabras son apellidos.
 * Con 2 palabras: 1 nombre + 1 apellido. Con 1 palabra: solo nombre.
 */
function partirNombre(completo: string): { nombre: string; apellidos: string } {
  const palabras = completo.trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 3) {
    return {
      nombre: palabras.slice(0, -2).join(' '),
      apellidos: palabras.slice(-2).join(' '),
    }
  }
  if (palabras.length === 2) {
    return { nombre: palabras[0], apellidos: palabras[1] }
  }
  return { nombre: palabras[0] ?? completo, apellidos: '' }
}
