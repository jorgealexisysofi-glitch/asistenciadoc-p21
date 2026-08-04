import { readFileSync } from 'node:fs'
import { read, utils } from 'xlsx'

const ruta = 'C:/Users/Jorge Herrera/Downloads/2026 CALENDARIO(2026b).csv'
const buf = readFileSync(ruta)

// Réplica de la lectura del importador para CSV (Windows-1252 si hay mojibake)
const esCSV = /\.csv$/i.test(ruta)
let wb
if (esCSV) {
  let texto = new TextDecoder('utf-8').decode(buf)
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
  wb = read(texto, { type: 'string' })
} else {
  wb = read(buf, { type: 'buffer' })
}
console.log('HOJAS:', wb.SheetNames)

const ws = wb.Sheets[wb.SheetNames[0]]
const filas = utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
  .filter((f) => f.some((c) => String(c ?? '').trim() !== ''))

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
function parseRango(t) {
  const p = String(t).split(/[-–—]/)
  if (p.length !== 2) return null
  const a = parseHora(p[0]), b = parseHora(p[1])
  if (!a || !b || b <= a) return null
  return { a, b }
}

const DIAS = [['l','lunes'],['m','martes'],['i','miercoles'],['j','jueves'],['v','viernes']]
const cab = filas[0].map(normalizar)
const buscar = (pred) => cab.findIndex(pred)
const idx = {
  codigo: buscar((h) => h === 'codigo'),
  nombre: buscar((h) => h === 'nombre'),
  materia: buscar((h) => h === 'materia'),
  cve: buscar((h) => h === 'cve materia' || (h.includes('cve') && h.includes('materia'))),
  aula: buscar((h) => h === 'aula'),
  dias: DIAS.map((al) => buscar((h) => al.includes(h))),
}
console.log('Encabezado Código detectado como:', JSON.stringify(cab[idx.codigo]))
console.log('Columnas detectadas:', JSON.stringify(idx))

let filasDatos = 0, sinCodigo = 0, celdas = 0, ok = 0, mal = 0, conAula = 0
const ejMal = []
for (let i = 1; i < filas.length; i++) {
  const f = filas[i]
  if (f.every((c) => String(c ?? '').trim() === '')) continue
  filasDatos++
  if (!String(f[idx.codigo] ?? '').trim()) sinCodigo++
  const aula = idx.aula >= 0 ? String(f[idx.aula] ?? '').trim() : ''
  for (const col of idx.dias) {
    const v = String(f[col] ?? '').trim()
    if (!v) continue
    celdas++
    if (parseRango(v)) { ok++; if (aula) conAula++ }
    else { mal++; if (ejMal.length < 12) ejMal.push(`fila ${i + 1}: «${v}»`) }
  }
}
console.log('\n=== PARSEO (CSV 2026b real) ===')
console.log('Filas de datos:', filasDatos)
console.log('Filas sin Código:', sinCodigo)
console.log('Celdas de día con contenido:', celdas)
console.log('Horarios OK:', ok, '(con aula en el archivo:', conAula + ')')
console.log('Rangos mal formados:', mal)
if (ejMal.length) console.log('Ejemplos malos:\n  ' + ejMal.join('\n  '))
// Muestra de nombres para verificar acentos
console.log('\nMuestra de nombres (acentos):')
;[54, 78, 94].forEach((r) => filas[r] && console.log('  ', filas[r][idx.nombre]))
