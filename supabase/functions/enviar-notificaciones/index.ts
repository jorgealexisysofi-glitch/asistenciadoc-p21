// Edge Function: enviar-notificaciones
//
// La dispara un cron cada ~5 min (ver 0026_push_notificaciones.sql). Lee la cola
// `get_notificaciones_pendientes` (con service_role) y envía un Web Push a cada
// dispositivo suscrito; registra el envío para no repetirlo y limpia las
// suscripciones vencidas (404/410).
//
// Secrets requeridos (Dashboard → Edge Functions → enviar-notificaciones → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:tu@correo.mx)
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen dados en el entorno.)
//
// Desplegar: supabase functions deploy enviar-notificaciones
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Pendiente {
  profesor_id: string
  endpoint: string
  p256dh: string
  auth: string
  tipo: 'proxima' | 'entrada' | 'salida'
  titulo: string
  cuerpo: string
  horario_id: string
  fecha: string
}

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@prepa21.mx'

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Leer el body una sola vez (para modos prueba / broadcast).
    let body: { prueba?: boolean; broadcast?: boolean; titulo?: string; cuerpo?: string; url?: string } | null = null
    try { body = await req.json() } catch { /* sin body */ }
    const params = new URL(req.url).searchParams

    // ¿Modo broadcast? (body {"broadcast":true, "titulo":..., "cuerpo":...}) →
    // manda un mensaje personalizado a TODOS los dispositivos suscritos.
    if (body && body.broadcast === true) {
      const { data, error } = await supabase.rpc('get_notificaciones_prueba')
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        })
      }
      const titulo = body.titulo ?? 'Asistencia Prepa 21'
      const cuerpo = body.cuerpo ?? ''
      const destino = body.url ?? '/home'
      let enviadas = 0
      let fallidas = 0
      for (const n of (data ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
        const payload = JSON.stringify({ title: titulo, body: cuerpo, url: destino, tag: 'aviso' })
        try {
          await webpush.sendNotification({ endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } }, payload)
          enviadas++
        } catch (e) {
          fallidas++
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await supabase.rpc('borrar_suscripcion', { p_endpoint: n.endpoint })
          }
        }
      }
      return new Response(JSON.stringify({ modo: 'broadcast', enviadas, fallidas }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ¿Modo prueba? (body {"prueba":true} o ?prueba=1) → manda a TODOS los
    // suscritos su próxima clase, sin ventana de tiempo y sin registrar envío.
    const prueba = params.get('prueba') === '1' || (body != null && body.prueba === true)
    if (prueba) {
      const { data, error } = await supabase.rpc('get_notificaciones_prueba')
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      let enviadas = 0
      let fallidas = 0
      for (const n of (data ?? []) as { endpoint: string; p256dh: string; auth: string; titulo: string; cuerpo: string }[]) {
        const payload = JSON.stringify({ title: n.titulo, body: n.cuerpo, url: '/home', tag: 'prueba' })
        try {
          await webpush.sendNotification({ endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } }, payload)
          enviadas++
        } catch (e) {
          fallidas++
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await supabase.rpc('borrar_suscripcion', { p_endpoint: n.endpoint })
          }
        }
      }
      return new Response(JSON.stringify({ modo: 'prueba', enviadas, fallidas }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await supabase.rpc('get_notificaciones_pendientes')
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let enviadas = 0
    let fallidas = 0
    for (const n of (data ?? []) as Pendiente[]) {
      const url = n.tipo === 'proxima' ? '/home' : '/validar'
      const payload = JSON.stringify({
        title: n.titulo,
        body: n.cuerpo,
        url,
        tag: `${n.horario_id}-${n.tipo}`,
      })
      try {
        await webpush.sendNotification(
          { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
          payload
        )
        await supabase.rpc('registrar_notificacion_enviada', {
          p_profesor_id: n.profesor_id,
          p_horario_id: n.horario_id,
          p_fecha: n.fecha,
          p_tipo: n.tipo,
        })
        enviadas++
      } catch (e) {
        fallidas++
        const status = (e as { statusCode?: number }).statusCode
        // Suscripción vencida/cancelada: se elimina para no reintentar.
        if (status === 404 || status === 410) {
          await supabase.rpc('borrar_suscripcion', { p_endpoint: n.endpoint })
        }
      }
    }

    return new Response(JSON.stringify({ enviadas, fallidas }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
