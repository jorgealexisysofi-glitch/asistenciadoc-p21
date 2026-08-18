// Cola local de registros de asistencia hechos SIN conexión.
//
// Se guarda en localStorage (los registros pendientes son pocos y pequeños).
// Cada item lleva `momento`: la hora REAL en que el maestro registró. Al
// sincronizar se le pasa a la RPC como p_momento, para que el registro quede a
// esa hora y no a la de sincronización. Las RPCs son idempotentes
// (on conflict do nothing / coalesce), así que reenviar dos veces no duplica.
import { supabase } from './supabase'

const CLAVE = 'asistenciadoc:cola-offline'

export interface ItemCola {
  /** id de cliente para poder borrarlo de la cola tras sincronizar */
  id: string
  tipo: 'entrada' | 'salida'
  /** hora real del registro (ISO); se envía como p_momento */
  momento: string
  profesor_id: string
  horario_id: string
  fecha: string
  // Solo para 'entrada':
  aula_id?: string | null
  metodo?: string
  beacon?: string | null
  lat?: number | null
  lon?: number | null
  /** texto para mostrar en la UI (p. ej. "Matemáticas · entrada") */
  etiqueta: string
}

export function obtenerCola(): ItemCola[] {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as ItemCola[]) : []
  } catch {
    return []
  }
}

function guardarCola(items: ItemCola[]) {
  localStorage.setItem(CLAVE, JSON.stringify(items))
}

/** Agrega un registro a la cola (reemplaza uno anterior de la misma clase+tipo) */
export function encolar(item: ItemCola) {
  const cola = obtenerCola().filter(
    (i) => !(i.horario_id === item.horario_id && i.fecha === item.fecha && i.tipo === item.tipo)
  )
  cola.push(item)
  guardarCola(cola)
}

export function quitarDeCola(id: string) {
  guardarCola(obtenerCola().filter((i) => i.id !== id))
}

export function contarPendientes(): number {
  return obtenerCola().length
}

/** ¿Hay un registro en cola para esta clase y tipo? */
export function tienePendiente(horario_id: string, fecha: string, tipo: ItemCola['tipo']): boolean {
  return obtenerCola().some(
    (i) => i.horario_id === horario_id && i.fecha === fecha && i.tipo === tipo
  )
}

/**
 * Intenta reenviar todos los registros en cola. Devuelve cuántos se
 * sincronizaron. Los que fallan se quedan para el siguiente intento.
 * Las entradas van antes que las salidas (una salida necesita su entrada).
 */
export async function sincronizarCola(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
  const cola = obtenerCola().sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'entrada' ? -1 : 1))
  if (cola.length === 0) return 0

  let sincronizados = 0
  for (const item of cola) {
    const { error } =
      item.tipo === 'entrada'
        ? await supabase.rpc('registrar_asistencia', {
            p_profesor_id: item.profesor_id,
            p_horario_id: item.horario_id,
            p_aula_id: item.aula_id ?? null,
            p_metodo: item.metodo ?? 'manual',
            p_beacon: item.beacon ?? null,
            p_lat: item.lat ?? null,
            p_lon: item.lon ?? null,
            p_momento: item.momento,
          })
        : await supabase.rpc('registrar_salida', {
            p_profesor_id: item.profesor_id,
            p_horario_id: item.horario_id,
            p_fecha: item.fecha,
            p_momento: item.momento,
          })

    if (!error) {
      quitarDeCola(item.id)
      sincronizados++
    }
    // Si hay error (sin red, o la salida aún no tiene su entrada), se conserva.
  }
  return sincronizados
}
