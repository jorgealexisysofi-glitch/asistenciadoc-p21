import { readFileSync } from 'node:fs'
import { read, utils } from 'xlsx'

const ruta = 'C:/Users/Jorge Herrera/Downloads/pa2026b con horarios.xls'
const buf = readFileSync(ruta)

const esCSV = /\.csv$/i.test(ruta)
let wb
if (esCSV) {
  let texto = new TextDecoder('utf-8').decode(buf)
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
  wb = read(texto, { type: 'string' })
} else {
  wb = read(buf, { type: 'buffer' })
}
console.log('HOJAS:', JSON.stringify(wb.SheetNames))

const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

// Prueba la detección de hoja del importador (2026a / 2026b, o hoja única)
const HOJAS_VALIDAS = ['2026a', '2026b']
const hoja =
  wb.SheetNames.find((n) => HOJAS_VALIDAS.includes(n.trim().toLowerCase())) ??
  (wb.SheetNames.length === 1 ? wb.SheetNames[0] : null)
console.log('Hoja que usaría el importador:', JSON.stringify(hoja))

if (!hoja) {
  console.log('⚠️ El importador NO sabría qué hoja usar (varias hojas y ninguna se llama 2026a/2026b).')
  process.exit(0)
}

const ws = wb.Sheets[hoja]
const filas = utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
  .filter((f) => f.some((c) => String(c ?? '').trim() !== ''))

const cab = filas[0].map(normalizar)
console.log('\nEncabezados:', JSON.stringify(filas[0]))

const buscar = (pred) => cab.findIndex(pred)
const DIAS = [['l','lunes'],['m','martes'],['i','miercoles'],['j','jueves'],['v','viernes']]
const idx = {
  codigo: buscar((h) => h === 'codigo'),
  nombre: buscar((h) => h === 'nombre'),
  materia: buscar((h) => h === 'materia'),
  cve: buscar((h) => h === 'cve materia' || (h.includes('cve') && h.includes('materia'))),
  aula: buscar((h) => h === 'aula'),
  dias: DIAS.map((al) => buscar((h) => al.includes(h))),
}
console.log('Columnas detectadas:', JSON.stringify(idx))

const faltan = []
if (idx.codigo < 0) faltan.push('Código')
if (idx.nombre < 0) faltan.push('Nombre')
if (idx.materia < 0) faltan.push('Materia')
idx.dias.forEach((d, i) => { if (d < 0) faltan.push('Día ' + DIAS[i][0].toUpperCase()) })

if (faltan.length) {
  console.log('\n❌ El importador RECHAZARÍA el archivo. Faltan columnas:', faltan.join(', '))
} else {
  console.log('\n✅ El importador SÍ lo entendería. Total filas de datos:', filas.length - 1)
  console.log('   ¿Trae columna AULA?', idx.aula >= 0 ? 'sí' : 'no')
}
