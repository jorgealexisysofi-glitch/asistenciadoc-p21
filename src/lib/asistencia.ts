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

/** timestamptz → hora local 'HH:MM' */
export function formatHoraRegistro(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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
