import type { EstadoAsistencia } from '../types'

/** Minutos de tolerancia tras la hora de inicio para contar como presente */
export const TOLERANCIA_MIN = 10

/** Estado del marcaje según la hora actual vs. la hora de inicio de la clase */
export function calcularEstado(horaInicio: string): Exclude<EstadoAsistencia, 'ausente'> {
  const [h, m] = horaInicio.split(':').map(Number)
  const limite = new Date()
  limite.setHours(h, (m ?? 0) + TOLERANCIA_MIN, 0, 0)
  return new Date() <= limite ? 'presente' : 'tarde'
}

/** '07:00:00' → '07:00' */
export function formatHora(hora: string): string {
  return hora.slice(0, 5)
}

/**
 * 'YYYY-MM-DD' (campo `date` de Postgres) → 'DD/MM/YYYY'.
 * Se parsea como texto SIN construir un Date: un `date` no lleva hora y, si se
 * pasara por `new Date('YYYY-MM-DD')`, se interpretaría como medianoche UTC y
 * podría recorrerse al día anterior en zonas con offset negativo.
 */
export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.slice(0, 10).split('-')
  if (!y || !m || !d) return String(fecha)
  return `${d}/${m}/${y}`
}

/** timestamptz → hora 'HH:MM' en la zona horaria de México (no la del navegador) */
export function formatHoraRegistro(timestamp: string | null | undefined): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Etiqueta legible del método con que se registró la asistencia */
export function etiquetaMetodo(metodo: string): string {
  switch (metodo) {
    case 'manual':
      return 'Manual'
    case 'kiosco':
      return 'Punto de control'
    default:
      return `Beacon ${metodo}`
  }
}

/** Saludo según la hora local */
export function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Día de la semana de hoy en convención ISO (1=Lunes … 7=Domingo) */
export function diaSemanaISO(): number {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
}

/** Minutos desde ahora hasta una hora 'HH:MM[:SS]' de hoy (negativo si ya pasó) */
export function minutosHasta(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  const objetivo = new Date()
  objetivo.setHours(h, m ?? 0, 0, 0)
  return Math.round((objetivo.getTime() - Date.now()) / 60_000)
}

/** Normaliza texto para comparaciones: minúsculas, sin acentos ni espacios extra */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

const DIAS_TEXTO: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
}

/** 'LUNES' / 'lun' / 1-7 → número 1=Lunes…7=Domingo (null si no se reconoce) */
export function parseDiaSemana(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n
  const t = normalizar(valor)
  for (const [nombre, dia] of Object.entries(DIAS_TEXTO)) {
    if (t === nombre || nombre.startsWith(t) || t.startsWith(nombre.slice(0, 3))) return dia
  }
  return null
}

/** 'HH:MM-HH:MM' → { inicio, fin } en 'HH:MM:SS'; null si está mal formado */
export function parseRangoHorario(
  texto: unknown
): { inicio: string; fin: string } | null {
  const partes = String(texto ?? '').split(/[-–—]/)
  if (partes.length !== 2) return null
  const inicio = parseHora(partes[0])
  const fin = parseHora(partes[1])
  if (!inicio || !fin || fin <= inicio) return null
  return { inicio, fin }
}

/** Cadena 'HH:MM' o número (fracción de día de Excel) → 'HH:MM:SS' (null si inválido) */
export function parseHora(valor: unknown): string | null {
  if (valor == null || valor === '') return null
  // Excel guarda las horas como fracción de día (0.5 = 12:00)
  if (typeof valor === 'number' && valor >= 0 && valor < 1) {
    const totalMin = Math.round(valor * 24 * 60)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
  }
  const m = String(valor).match(/(\d{1,2})\s*[:.]\s*(\d{2})/)
  if (m) {
    const h = Number(m[1])
    const min = Number(m[2])
    if (h <= 23 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
    }
  }
  // Solo hora ('7' → 07:00)
  const soloHora = String(valor).trim().match(/^(\d{1,2})$/)
  if (soloHora) {
    const h = Number(soloHora[1])
    if (h <= 23) return `${String(h).padStart(2, '0')}:00:00`
  }
  return null
}
