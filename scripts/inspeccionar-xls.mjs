import { readFileSync } from 'node:fs'
import { read, utils } from 'xlsx'

const ruta = 'C:/Users/Jorge Herrera/Downloads/2026a.xls'
const wb = read(readFileSync(ruta), { type: 'buffer' })
const ws = wb.Sheets['2026a']
const filas = utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })

const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

function parseHora(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const m = Math.round(v * 1440)
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
  }
  const m = String(v).match(/(\d{1,2})\s*[:.]\s*(\d{2})/)
  if (m && +m[1] <= 23 && +m[2] <= 59) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:00`
  const s = String(v).trim().match(/^(\d{1,2})$/)
  if (s && +s[1] <= 23) return `${s[1].padStart(2, '0')}:00:00`
  return null
}

function parseRango(texto) {
  const partes = String(texto).split(/[-–—]/)
  if (partes.length !== 2) return null
  const inicio = parseHora(partes[0])
  const fin = parseHora(partes[1])
  if (!inicio || !fin || fin <= inicio) return null
  return { inicio, fin }
}

// Detección de columnas por encabezado
const cab = filas[0].map(normalizar)
const colDe = (pred) => cab.findIndex(pred)
const idx = {
  codigo: colDe((h) => h === 'codigo'),
  nombre: colDe((h) => h === 'nombre'),
  materia: colDe((h) => h === 'materia'),
  cve: colDe((h) => h === 'cve materia' || (h.includes('cve') && h.includes('materia'))),
  dias: { L: colDe((h) => h === 'l'), M: colDe((h) => h === 'm'), I: colDe((h) => h === 'i'), J: colDe((h) => h === 'j'), V: colDe((h) => h === 'v') },
}
console.log('Columnas detectadas:', JSON.stringify(idx))

let filasDatos = 0
let filasSinCodigo = 0
let celdasDia = 0
let horariosOk = 0
let rangosMal = 0
const ejemplosMal = []

for (let i = 1; i < filas.length; i++) {
  const f = filas[i]
  if (f.every((c) => String(c ?? '').trim() === '')) continue
  filasDatos++
  const codigo = String(f[idx.codigo] ?? '').trim()
  if (!codigo) filasSinCodigo++
  for (const col of Object.values(idx.dias)) {
    const v = String(f[col] ?? '').trim()
    if (v === '') continue
    celdasDia++
    const r = parseRango(v)
    if (r) horariosOk++
    else {
      rangosMal++
      if (ejemplosMal.length < 15) ejemplosMal.push(`fila ${i + 1}: «${v}»`)
    }
  }
}

console.log('\n=== RESULTADOS DEL PARSEO (hoja 2026a) ===')
console.log('Filas de datos:', filasDatos)
console.log('Filas sin Código (dependerán del Nombre):', filasSinCodigo)
console.log('Celdas de día con contenido:', celdasDia)
console.log('Horarios que se generarían OK:', horariosOk)
console.log('Rangos de horario mal formados:', rangosMal)
if (ejemplosMal.length) console.log('Ejemplos de rangos problemáticos:\n  ' + ejemplosMal.join('\n  '))
