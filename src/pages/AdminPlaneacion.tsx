import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { IconDownload, IconPlus, IconTrash, IconUpload } from '../components/icons'
import { supabase } from '../lib/supabase'
import { derivarGrupo, formatHora, normalizar, parseRangoHorario } from '../lib/asistencia'
import { aMinutos, calcularChoques, idsEnChoque, valoresDistintos } from '../lib/planeacion'
import type { ClasePlan } from '../types'

const CLAVE_LS = 'asistenciadoc:planeacion'
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const HORA_INI = 7
const HORA_FIN = 22
const HORAS = Array.from({ length: HORA_FIN - HORA_INI }, (_, i) => HORA_INI + i)

type Vista = 'profesor' | 'grupo' | 'aula'
type Fila = (string | number)[]

function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function leerLS(): ClasePlan[] {
  try {
    const raw = localStorage.getItem(CLAVE_LS)
    return raw ? (JSON.parse(raw) as ClasePlan[]) : []
  } catch {
    return []
  }
}

const claseVacia = (parcial?: Partial<ClasePlan>): ClasePlan => ({
  id: nuevoId(),
  codigo: '',
  profesor: '',
  materia: '',
  clave: '',
  carrera: '',
  crn: '',
  grupo: '',
  tipo: '',
  aula: '',
  horas: '',
  dia_semana: 1,
  hora_inicio: '07:00:00',
  hora_fin: '08:00:00',
  ...parcial,
})

export default function AdminPlaneacion() {
  const [clases, setClases] = useState<ClasePlan[]>(() => leerLS())
  const [vista, setVista] = useState<Vista>('profesor')
  const [seleccion, setSeleccion] = useState('')
  const [editando, setEditando] = useState<ClasePlan | null>(null)
  const [verChoques, setVerChoques] = useState(true)
  const [importandoDb, setImportandoDb] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Persistir en el navegador
  useEffect(() => {
    localStorage.setItem(CLAVE_LS, JSON.stringify(clases))
  }, [clases])

  const opciones = useMemo(() => valoresDistintos(clases, vista), [clases, vista])
  useEffect(() => {
    setSeleccion((s) => (opciones.includes(s) ? s : (opciones[0] ?? '')))
  }, [opciones])

  const choques = useMemo(() => calcularChoques(clases), [clases])
  const idsChoque = useMemo(() => idsEnChoque(choques), [choques])

  const visibles = useMemo(
    () => clases.filter((c) => (c[vista] || '').trim() === seleccion),
    [clases, vista, seleccion]
  )

  // ---------- Importar horarios previos (de la base) ----------
  const importarPrevios = useCallback(async () => {
    if (clases.length > 0 && !window.confirm('Esto reemplazará el plan actual. ¿Continuar?')) return
    setImportandoDb(true)
    const { data, error } = await supabase.rpc('get_horarios_planeacion')
    setImportandoDb(false)
    if (error) {
      toast.error('No se pudieron cargar los horarios. ¿Entraste como administrador?')
      return
    }
    type Row = {
      codigo: string; profesor: string; materia: string; clave: string; aula: string
      grupo: string; dia_semana: number; hora_inicio: string; hora_fin: string
    }
    const nuevas = ((data ?? []) as Row[]).map((r) =>
      claseVacia({
        codigo: r.codigo, profesor: r.profesor, materia: r.materia, clave: r.clave,
        aula: r.aula, grupo: r.grupo, dia_semana: r.dia_semana,
        hora_inicio: r.hora_inicio, hora_fin: r.hora_fin,
      })
    )
    setClases(nuevas)
    toast.success(`${nuevas.length} clase(s) cargada(s) del horario actual.`)
  }, [clases.length])

  // ---------- Importar Excel de cargas ----------
  async function importarExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (clases.length > 0 && !window.confirm('Esto reemplazará el plan actual. ¿Continuar?')) return
    try {
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
        wb.SheetNames.find((n) => ['2026a', '2026b'].includes(n.trim().toLowerCase())) ??
        (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null)
      if (!hoja) {
        toast.error('El Excel no tiene una hoja de cargas (2026a o 2026b).')
        return
      }
      const data = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: '' }) as Fila[]
      const filas = data.filter((f) => f.some((c) => String(c ?? '').trim() !== ''))
      if (filas.length < 2) {
        toast.error('El archivo no tiene filas de datos.')
        return
      }
      const cab = filas[0].map(normalizar)
      const buscar = (pred: (h: string) => boolean) => cab.findIndex(pred)
      const col = {
        materia: buscar((h) => h === 'materia'),
        clave: buscar((h) => h.includes('cve') && h.includes('materia')),
        carrera: buscar((h) => h === 'carrera'),
        crn: buscar((h) => h === 'crn'),
        grupo: buscar((h) => h.includes('grupo') || h.includes('seccion')),
        tipo: buscar((h) => h === 'tipo'),
        codigo: buscar((h) => h === 'codigo'),
        nombre: buscar((h) => h === 'nombre'),
        horas: buscar((h) => h === 'horas'),
        aula: buscar((h) => h === 'aula'),
        dias: [
          ['l', 'lunes'], ['m', 'martes'], ['i', 'miercoles'], ['j', 'jueves'], ['v', 'viernes'],
        ].map((al) => buscar((h) => al.includes(h))),
      }
      if (col.materia < 0 || col.dias.some((d) => d < 0)) {
        toast.error('No se detectaron las columnas esperadas (Materia y los días).')
        return
      }
      const val = (fila: Fila, idx: number) => (idx >= 0 ? String(fila[idx] ?? '').trim() : '')
      const nuevas: ClasePlan[] = []
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i]
        const base = {
          materia: val(fila, col.materia),
          clave: val(fila, col.clave),
          carrera: val(fila, col.carrera),
          crn: val(fila, col.crn),
          grupo: derivarGrupo(fila[col.grupo]),
          tipo: val(fila, col.tipo),
          codigo: val(fila, col.codigo),
          profesor: val(fila, col.nombre),
          horas: val(fila, col.horas),
          aula: val(fila, col.aula),
        }
        if (!base.materia) continue
        for (let d = 0; d < 5; d++) {
          const texto = val(fila, col.dias[d])
          if (!texto) continue
          const rango = parseRangoHorario(texto)
          if (!rango) continue
          nuevas.push(claseVacia({ ...base, dia_semana: d + 1, hora_inicio: rango.inicio, hora_fin: rango.fin }))
        }
      }
      if (nuevas.length === 0) {
        toast.error('No se encontraron clases válidas en el archivo.')
        return
      }
      setClases(nuevas)
      toast.success(`${nuevas.length} clase(s) importada(s) del Excel.`)
    } catch {
      toast.error('No se pudo leer el archivo. Verifica que sea .xlsx, .xls o .csv.')
    }
  }

  // ---------- Guardar / borrar clase del modal ----------
  function guardarClase(c: ClasePlan) {
    if (!c.materia.trim()) {
      toast.error('La materia es obligatoria.')
      return
    }
    if (aMinutos(c.hora_fin) <= aMinutos(c.hora_inicio)) {
      toast.error('La hora de fin debe ser mayor que la de inicio.')
      return
    }
    setClases((prev) => {
      const existe = prev.some((x) => x.id === c.id)
      return existe ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]
    })
    setEditando(null)
  }
  function borrarClase(id: string) {
    setClases((prev) => prev.filter((x) => x.id !== id))
    setEditando(null)
  }

  // ---------- Descargar reporte ----------
  async function descargarReporte() {
    if (clases.length === 0) {
      toast.error('No hay clases para exportar.')
      return
    }
    const XLSX = await import('xlsx')
    const hojaClases = [...clases]
      .sort((a, b) =>
        `${a.profesor}`.localeCompare(b.profesor, 'es') ||
        a.dia_semana - b.dia_semana ||
        aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio)
      )
      .map((c) => ({
        Profesor: c.profesor, Código: c.codigo, Materia: c.materia, Clave: c.clave,
        Carrera: c.carrera, CRN: c.crn, Grupo: c.grupo, Tipo: c.tipo, Aula: c.aula,
        Horas: c.horas, Día: DIAS[c.dia_semana] ?? '',
        Inicio: formatHora(c.hora_inicio), Fin: formatHora(c.hora_fin),
      }))
    const hojaChoques = choques.map((ch) => ({
      Tipo: ch.tipo, 'En común': ch.valor,
      'Clase A': `${ch.a.materia} · ${ch.a.profesor} · ${DIAS_CORTO[ch.a.dia_semana]} ${formatHora(ch.a.hora_inicio)}-${formatHora(ch.a.hora_fin)}`,
      'Clase B': `${ch.b.materia} · ${ch.b.profesor} · ${DIAS_CORTO[ch.b.dia_semana]} ${formatHora(ch.b.hora_inicio)}-${formatHora(ch.b.hora_fin)}`,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaClases), 'Clases')
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(hojaChoques.length ? hojaChoques : [{ Tipo: 'Sin choques' }]),
      'Choques'
    )
    XLSX.writeFile(wb, 'Planeacion_horarios.xlsx')
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Planeación' }]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planeación de horarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Arma el horario de forma visual y detecta choques de profesor, aula y grupo. Es un
            borrador: no afecta el horario en vivo. Se guarda en este navegador.
          </p>
        </div>
      </div>

      {/* Barra de herramientas */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void importarPrevios()} disabled={importandoDb} className="btn-secondary">
          <IconDownload className="h-4 w-4" />
          {importandoDb ? 'Cargando…' : 'Importar horarios previos'}
        </button>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary">
          <IconUpload className="h-4 w-4" />
          Importar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importarExcel} />
        <button onClick={() => setEditando(claseVacia({ [vista]: seleccion } as Partial<ClasePlan>))} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Agregar clase
        </button>
        <button onClick={() => void descargarReporte()} className="btn-secondary">
          <IconDownload className="h-4 w-4" />
          Descargar reporte
        </button>
        {clases.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('¿Vaciar todo el plan? (No afecta el horario en vivo.)')) setClases([])
            }}
            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <IconTrash className="mr-1.5 inline h-4 w-4" />
            Vaciar
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="card !py-3 text-center">
          <p className="text-2xl font-bold text-udeg-azul">{clases.length}</p>
          <p className="text-xs text-gray-500">Clases</p>
        </div>
        <div className={`card !py-3 text-center ${choques.length ? 'border-red-200' : ''}`}>
          <p className={`text-2xl font-bold ${choques.length ? 'text-red-600' : 'text-emerald-600'}`}>
            {choques.length}
          </p>
          <p className="text-xs text-gray-500">Choques</p>
        </div>
        <div className="card !py-3 text-center">
          <p className="text-2xl font-bold text-gray-700">{valoresDistintos(clases, 'grupo').length}</p>
          <p className="text-xs text-gray-500">Grupos</p>
        </div>
      </div>

      {clases.length === 0 ? (
        <div className="card mt-5 text-sm text-gray-600">
          <p className="font-semibold text-gray-800">Empieza tu planeación</p>
          <p className="mt-1">
            Usa <span className="font-semibold">Importar horarios previos</span> para partir del
            horario actual, <span className="font-semibold">Importar Excel</span> para cargar las
            cargas, o <span className="font-semibold">Agregar clase</span> para armarlo a mano.
          </p>
        </div>
      ) : (
        <>
          {/* Choques */}
          {choques.length > 0 && (
            <section className="mt-5">
              <button
                onClick={() => setVerChoques((v) => !v)}
                className="text-sm font-semibold text-red-600 hover:underline"
              >
                {verChoques ? 'Ocultar' : 'Ver'} {choques.length} choque(s) ⚠️
              </button>
              {verChoques && (
                <div className="card mt-2 max-h-56 overflow-y-auto !p-0">
                  <ul className="divide-y divide-gray-50 text-sm">
                    {choques.map((ch, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <span className={`badge mr-2 ${
                            ch.tipo === 'profesor' ? 'bg-udeg-azul-light text-udeg-azul'
                              : ch.tipo === 'aula' ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                          }`}>
                            {ch.tipo}
                          </span>
                          <span className="font-semibold text-gray-800">{ch.valor}</span>
                          <span className="text-xs text-gray-500">
                            {' '}· {DIAS_CORTO[ch.a.dia_semana]} {formatHora(ch.a.hora_inicio)}–{formatHora(ch.a.hora_fin)}:{' '}
                            {ch.a.materia} ✕ {ch.b.materia}
                          </span>
                        </div>
                        <button
                          onClick={() => { setVista(ch.tipo); setSeleccion(ch.valor) }}
                          className="shrink-0 text-xs font-semibold text-udeg-azul hover:underline"
                        >
                          Ver
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Selector de vista */}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">Ver por</p>
              <div className="flex overflow-hidden rounded-xl border border-gray-200">
                {(['profesor', 'grupo', 'aula'] as Vista[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVista(v)}
                    className={`px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                      vista === v ? 'bg-udeg-naranja text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="sel" className="mb-1 block text-xs font-semibold text-gray-500 capitalize">
                {vista}
              </label>
              <select id="sel" className="input !py-2" value={seleccion} onChange={(e) => setSeleccion(e.target.value)}>
                {opciones.length === 0 && <option value="">(sin datos)</option>}
                {opciones.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rejilla semanal */}
          <div className="mt-4">
            <GridSemanal
              clases={visibles}
              idsChoque={idsChoque}
              onEditar={(c) => setEditando(c)}
              onAgregar={(dia, hora) =>
                setEditando(claseVacia({
                  [vista]: seleccion,
                  dia_semana: dia,
                  hora_inicio: `${String(hora).padStart(2, '0')}:00:00`,
                  hora_fin: `${String(hora + 1).padStart(2, '0')}:00:00`,
                } as Partial<ClasePlan>))
              }
            />
          </div>
        </>
      )}

      {editando && (
        <ModalClase
          clase={editando}
          onGuardar={guardarClase}
          onBorrar={borrarClase}
          onCerrar={() => setEditando(null)}
        />
      )}
    </AdminLayout>
  )
}

// ---------- Rejilla semanal ----------
function GridSemanal({
  clases, idsChoque, onEditar, onAgregar,
}: {
  clases: ClasePlan[]
  idsChoque: Set<string>
  onEditar: (c: ClasePlan) => void
  onAgregar: (dia: number, hora: number) => void
}) {
  return (
    <div className="card overflow-x-auto !p-2">
      <div
        className="grid min-w-[720px] text-xs"
        style={{
          gridTemplateColumns: '56px repeat(5, 1fr)',
          gridTemplateRows: `28px repeat(${HORAS.length}, minmax(44px, 1fr))`,
        }}
      >
        <div className="border-b border-r border-gray-200" />
        {DIAS_CORTO.slice(1).map((dia, di) => (
          <div
            key={dia}
            className="flex items-center justify-center border-b border-gray-200 bg-udeg-azul-light font-semibold text-udeg-azul"
            style={{ gridColumn: di + 2, gridRow: 1 }}
          >
            {dia}
          </div>
        ))}
        {HORAS.map((h, hi) => (
          <div
            key={h}
            className="flex items-start justify-end border-r border-t border-gray-100 bg-gray-50 px-1 pt-0.5 font-medium text-gray-400"
            style={{ gridColumn: 1, gridRow: hi + 2 }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
        {DIAS_CORTO.slice(1).map((_, di) =>
          HORAS.map((h, hi) => (
            <button
              key={`${di}-${h}`}
              onClick={() => onAgregar(di + 1, h)}
              title="Agregar clase aquí"
              className="border-t border-gray-100 transition-colors hover:bg-udeg-naranja-light/40"
              style={{ gridColumn: di + 2, gridRow: hi + 2, borderRight: di < 4 ? '1px solid #f3f4f6' : 'none' }}
            />
          ))
        )}
        {clases.map((c) => {
          const iniMin = aMinutos(c.hora_inicio)
          const finMin = aMinutos(c.hora_fin)
          const filaIni = Math.max(0, Math.floor(iniMin / 60) - HORA_INI) + 2
          const filaFin = Math.min(HORAS.length, Math.ceil(finMin / 60) - HORA_INI) + 2
          const choca = idsChoque.has(c.id)
          return (
            <button
              key={c.id}
              onClick={() => onEditar(c)}
              className={`m-0.5 flex flex-col justify-center overflow-hidden rounded-md px-1.5 py-1 text-left text-white ${
                choca ? 'bg-red-500 ring-2 ring-red-300' : 'bg-udeg-naranja'
              }`}
              style={{ gridColumn: c.dia_semana + 1, gridRow: `${filaIni} / ${Math.max(filaIni + 1, filaFin)}` }}
            >
              <p className="truncate text-[11px] font-bold leading-tight">{c.materia || '(sin materia)'}</p>
              <p className="truncate text-[10px] leading-tight opacity-90">
                {c.grupo && `${c.grupo} · `}{c.aula || 'sin aula'}
              </p>
              <p className="text-[9px] leading-tight opacity-80">
                {formatHora(c.hora_inicio)}–{formatHora(c.hora_fin)}
                {choca ? ' · ⚠️' : ''}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Modal agregar/editar clase ----------
function ModalClase({
  clase, onGuardar, onBorrar, onCerrar,
}: {
  clase: ClasePlan
  onGuardar: (c: ClasePlan) => void
  onBorrar: (id: string) => void
  onCerrar: () => void
}) {
  const [f, setF] = useState<ClasePlan>(clase)
  const set = (k: keyof ClasePlan, v: string | number) => setF((p) => ({ ...p, [k]: v }))
  const th = (hhmmss: string) => hhmmss.slice(0, 5)

  const campos: [keyof ClasePlan, string][] = [
    ['profesor', 'Profesor'], ['codigo', 'Código'], ['materia', 'Materia'], ['clave', 'Clave'],
    ['grupo', 'Grupo'], ['aula', 'Aula'], ['carrera', 'Carrera'], ['crn', 'CRN'],
    ['tipo', 'Tipo'], ['horas', 'Horas'],
  ]

  return (
    <Modal open title={clase.materia ? 'Editar clase' : 'Agregar clase'} onClose={onCerrar}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {campos.map(([k, etq]) => (
            <div key={k} className={k === 'materia' ? 'col-span-2' : ''}>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{etq}</label>
              <input
                className="input !py-2"
                value={String(f[k] ?? '')}
                onChange={(e) => set(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Día</label>
            <select className="input !py-2" value={f.dia_semana} onChange={(e) => set('dia_semana', Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>{DIAS[d]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Inicio</label>
              <input type="time" className="input !py-2" value={th(f.hora_inicio)} onChange={(e) => set('hora_inicio', `${e.target.value || '07:00'}:00`)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Fin</label>
              <input type="time" className="input !py-2" value={th(f.hora_fin)} onChange={(e) => set('hora_fin', `${e.target.value || '08:00'}:00`)} />
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            onClick={() => onBorrar(f.id)}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Borrar
          </button>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="btn-ghost">Cancelar</button>
            <button onClick={() => onGuardar(f)} className="btn-primary">Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
