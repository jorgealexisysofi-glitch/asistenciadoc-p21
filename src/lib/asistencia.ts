import type { EstadoAsistencia, MiResumenAsistencia } from '../types'

/** Minutos de tolerancia tras la hora de inicio para contar como presente (12 min = 1 min antes + 10 min después + 1 min tolerancia extra) */
export const TOLERANCIA_MIN = 12

/** Firmar salida al terminar la clase (true = habilitado). */
export const FIRMAR_SALIDA_HABILITADO: boolean = true

/** La salida se puede firmar desde N min antes del fin de la clase. */
export const SALIDA_ANTES_MIN = 30

/**
 * Punto de control de prefectura (checador de kiosco, ruta /checador) en
 * mantenimiento. Mientras sea `true`, la pantalla muestra un aviso y no permite
 * registrar. Para reactivarlo, cambia a `false` y vuelve a desplegar.
 */
export const CHECADOR_EN_MANTENIMIENTO: boolean = false

/** Tono del mensaje personalizado de bienvenida (define color/ícono) */
export type TonoMensaje = 'alerta' | 'aviso' | 'positivo'

export interface MensajePersonalizado {
  tono: TonoMensaje
  texto: string
}

/** Mínimo de clases (sin contar justificadas) para opinar; con menos, no hay datos suficientes */
const MIN_CLASES_PARA_MENSAJE = 3
/** % de asistencia bajo el cual se considera "varias faltas" */
const UMBRAL_FALTAS_PCT = 75
/** % de tardanza (de las veces que asistió) a partir del cual se le avisa */
const UMBRAL_TARDANZA_PCT = 30
/** % de asistencia y de tardanza para felicitar */
const UMBRAL_BIEN_PCT = 90
const UMBRAL_BIEN_TARDANZA_PCT = 15

/** Hash simple y estable (no criptográfico) para elegir el mismo mensaje todo el día */
function hashEstable(texto: string): number {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Elige una variante estable (mismo día + mismo maestro + mismo tono → mismo texto) */
function elegir(pool: string[], semilla: string): string {
  return pool[hashEstable(semilla) % pool.length]
}

const DICHOS_FALTAS = (faltas: number, pct: number) => {
  const f = `${faltas} falta${faltas === 1 ? '' : 's'}`
  return [
    `Esta semana llevas ${f}, no olvides registrar tu asistencia — ¡te extrañamos en el salón! 👋`,
    `"Camarón que se duerme, se lo lleva la corriente" 🦐 — llevas ${f} esta semana. ¡No dejes que se te escape el registro!`,
    `Ánimo, pero con horario: tu asistencia esta semana va en ${pct.toFixed(0)}%. Recuerda registrar cada clase.`,
    `Esta semana ha estado floja la asistencia (${pct.toFixed(0)}%). Como dicen, "más vale tarde que nunca"… ¡pero mejor a tiempo! 😉`,
    `${f} esta semana. "El que no enseña, no aprende" — y el que no registra, no cuenta. ¡Te esperamos en tu próxima clase!`,
  ]
}

const DICHOS_TARDANZA = (tardes: number, asis: number) => [
  `Llegas tarde seguido esta semana (${tardes} de ${asis} clases). "Al que madruga, Dios lo ayuda" — unos minutos antes hacen la diferencia ⏰`,
  `Vas justito de tiempo: ${tardes} de ${asis} registros fueron tarde esta semana. ¡Achícale un poco al paso!`,
  `"Camarón que se duerme…" tú ya sabes 🦐 — procura llegar unos minutos antes a tus próximas clases.`,
  `El reloj no perdona: ${tardes} llegada${tardes === 1 ? '' : 's'} tarde esta semana. ¡Un poquito más de prisa y listo!`,
  `Esta semana el tiempo se te fue de las manos ${tardes} vece${tardes === 1 ? 'z' : 's'}. Nada grave, solo ponle un poco más de ganas al reloj ⏰`,
]

const DICHOS_PERFECTO = [
  '¡Semana perfecta! Esta semana has asistido a todas tus clases. 🌟',
  '"El que persevera, alcanza" — y tú esta semana alcanzaste el 100%. ¡Excelente! 🎉',
  '100% de asistencia esta semana. ¡Así se hace! 👏',
  'Ni una falta esta semana — de los que no se rajan. 💪',
  'Semana redonda: asististe a todas tus clases. ¡Sigue así! ✨',
]

const DICHOS_BIEN = (pct: number) => [
  `¡Vas muy bien! Tu asistencia esta semana es del ${pct.toFixed(0)}%. Sigue así 👏`,
  `"El que persevera, alcanza" — llevas ${pct.toFixed(0)}% de asistencia esta semana. ¡Bien hecho!`,
  `Semana sólida: ${pct.toFixed(0)}% de asistencia. ¡Que no se te baje el ritmo!`,
  `Puntual y presente — así se construye una buena racha. ${pct.toFixed(0)}% esta semana 🙌`,
  `Vas por buen camino: ${pct.toFixed(0)}% de asistencia esta semana. ¡Que siga la buena racha!`,
]

/**
 * Mensaje personalizado de bienvenida según el patrón de asistencia del
 * maestro esta semana (RPC `get_mi_resumen_asistencia`): avisa si tiene varias
 * faltas o llega tarde seguido, o lo felicita si va muy bien. Elige entre
 * varias frases (algunas con dichos) — la misma todo el día, para no
 * cambiarle el mensaje cada vez que recarga. `null` si no hay datos
 * suficientes o está en zona neutra (no amerita aviso).
 */
export function mensajePersonalizado(
  r: MiResumenAsistencia | null,
  profesorId?: string | null
): MensajePersonalizado | null {
  if (!r) return null
  const base = r.total_clases - r.justificadas
  if (base < MIN_CLASES_PARA_MENSAJE) return null

  const pct = r.pct ?? 0
  const pctTardanza = r.pct_tardanza ?? 0
  // Semilla estable por maestro + día, para que el mensaje no cambie a cada rato
  const semilla = `${profesorId ?? ''}-${new Date().toISOString().slice(0, 10)}`

  if (pct < UMBRAL_FALTAS_PCT) {
    return { tono: 'alerta', texto: elegir(DICHOS_FALTAS(r.faltas, pct), semilla) }
  }
  if (pctTardanza >= UMBRAL_TARDANZA_PCT) {
    return { tono: 'aviso', texto: elegir(DICHOS_TARDANZA(r.tardes, r.presentes + r.tardes), semilla) }
  }
  if (pct >= UMBRAL_BIEN_PCT && pctTardanza < UMBRAL_BIEN_TARDANZA_PCT) {
    const pool = pct >= 100 && r.faltas === 0 ? DICHOS_PERFECTO : DICHOS_BIEN(pct)
    return { tono: 'positivo', texto: elegir(pool, semilla) }
  }
  return null
}

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

/**
 * Deriva el grupo de alumnos de un valor tipo "6 - A1 - M - 553276"
 * (grado - grupo - turno - CRN/sección): quita el último token si es un id
 * (numérico o 'SEC…') y une el resto → "6 A1 M". "1 - E1" → "1 E1".
 */
export function derivarGrupo(valor: unknown): string {
  const partes = String(valor ?? '')
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean)
  if (partes.length === 0) return ''
  const ultimo = partes[partes.length - 1]
  const esId = /^\d+$/.test(ultimo) || /^sec\d*/i.test(ultimo)
  const tokens = esId && partes.length > 1 ? partes.slice(0, -1) : partes
  return tokens.join(' ')
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
