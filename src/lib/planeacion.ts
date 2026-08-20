// Lógica del planificador de horarios: detección de choques y utilidades.
import { normalizar } from './asistencia'
import type { ClasePlan } from '../types'

/** 'HH:MM[:SS]' → minutos desde medianoche */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** ¿Dos bloques del mismo día se traslapan en el tiempo? */
function seTraslapan(a: ClasePlan, b: ClasePlan): boolean {
  if (a.dia_semana !== b.dia_semana) return false
  return aMinutos(a.hora_inicio) < aMinutos(b.hora_fin) && aMinutos(b.hora_inicio) < aMinutos(a.hora_fin)
}

export type TipoChoque = 'profesor' | 'aula' | 'grupo'

export interface Choque {
  tipo: TipoChoque
  /** valor en común (nombre de profesor, aula o grupo) */
  valor: string
  a: ClasePlan
  b: ClasePlan
}

/** clave normalizada de cada dimensión (vacío = no aplica) */
function claveProfesor(c: ClasePlan): string {
  return normalizar(c.codigo) || normalizar(c.profesor)
}
function claveAula(c: ClasePlan): string {
  return normalizar(c.aula)
}
function claveGrupo(c: ClasePlan): string {
  return normalizar(c.grupo)
}

/** Calcula todos los choques (profesor / aula / grupo) entre las clases */
export function calcularChoques(clases: ClasePlan[]): Choque[] {
  const choques: Choque[] = []
  for (let i = 0; i < clases.length; i++) {
    for (let j = i + 1; j < clases.length; j++) {
      const a = clases[i]
      const b = clases[j]
      if (!seTraslapan(a, b)) continue
      const pa = claveProfesor(a)
      const pb = claveProfesor(b)
      if (pa && pa === pb) choques.push({ tipo: 'profesor', valor: a.profesor || a.codigo, a, b })
      const aa = claveAula(a)
      const ab = claveAula(b)
      if (aa && aa === ab) choques.push({ tipo: 'aula', valor: a.aula, a, b })
      const ga = claveGrupo(a)
      const gb = claveGrupo(b)
      if (ga && ga === gb) choques.push({ tipo: 'grupo', valor: a.grupo, a, b })
    }
  }
  return choques
}

/** Ids de clases que participan en algún choque */
export function idsEnChoque(choques: Choque[]): Set<string> {
  const s = new Set<string>()
  for (const c of choques) {
    s.add(c.a.id)
    s.add(c.b.id)
  }
  return s
}

/** Lista ordenada de valores distintos de una dimensión (para los filtros) */
export function valoresDistintos(clases: ClasePlan[], campo: 'profesor' | 'grupo' | 'aula'): string[] {
  const set = new Set<string>()
  for (const c of clases) {
    const v = (c[campo] || '').trim()
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}
