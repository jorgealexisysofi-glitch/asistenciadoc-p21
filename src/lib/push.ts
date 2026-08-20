// Suscripción a notificaciones push (Web Push) desde la app.
import { supabase } from './supabase'

const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

/** ¿El navegador soporta push y hay llave VAPID configurada? */
export function pushSoportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID
  )
}

/** La llave VAPID (base64url) → Uint8Array para applicationServerKey */
function base64ToUint8(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!pushSoportado()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export type ResultadoPush = 'ok' | 'bloqueado' | 'error'

/** Pide permiso, suscribe el dispositivo y lo guarda ligado al profesor */
export async function activarPush(profesorId: string): Promise<ResultadoPush> {
  if (!pushSoportado() || !VAPID) return 'error'
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return 'bloqueado'
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID),
      })
    }
    const json = sub.toJSON()
    const { error } = await supabase.rpc('guardar_suscripcion', {
      p_profesor_id: profesorId,
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? '',
      p_auth: json.keys?.auth ?? '',
    })
    return error ? 'error' : 'ok'
  } catch {
    return 'error'
  }
}

/** Cancela la suscripción de este dispositivo */
export async function desactivarPush(): Promise<void> {
  const sub = await suscripcionActual()
  if (!sub) return
  await supabase.rpc('borrar_suscripcion', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}
