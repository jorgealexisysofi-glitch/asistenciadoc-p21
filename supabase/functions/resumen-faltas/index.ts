// Edge Function: resumen-faltas
//
// La dispara un cron al final del día (ver 0028_faltas_del_dia.sql). Lee las
// faltas de hoy (get_faltas_del_dia) y manda un correo con el resumen, vía
// Resend, a los destinatarios configurados. Si no hubo faltas, no envía nada.
//
// Secrets (Dashboard → Edge Functions → resumen-faltas → Secrets):
//   RESEND_API_KEY        → tu API key de resend.com
//   EMAIL_FROM            → remitente, ej. "Asistencia Prepa 21 <faltas@tudominio.mx>"
//                           (en modo prueba de Resend usa "onboarding@resend.dev")
//   FALTAS_EMAIL_DESTINO  → correo(s) que reciben el resumen, separados por coma
//
// Desplegar: supabase functions deploy resumen-faltas
import { createClient } from 'npm:@supabase/supabase-js@2'

interface Falta {
  profesor_nombre: string
  profesor_apellidos: string
  correo: string | null
  materia: string
  aula: string | null
  hora_inicio: string
  hora_fin: string
}

const hhmm = (t: string) => t.slice(0, 5)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const RESEND = Deno.env.get('RESEND_API_KEY')
    const FROM = Deno.env.get('EMAIL_FROM') ?? 'Asistencia Prepa 21 <onboarding@resend.dev>'
    const DESTINO = (Deno.env.get('FALTAS_EMAIL_DESTINO') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean)
    if (!RESEND) return json({ error: 'Falta RESEND_API_KEY' }, 500)
    if (DESTINO.length === 0) return json({ error: 'Falta FALTAS_EMAIL_DESTINO' }, 500)

    // Modo prueba (?test=1 o body {"test":true}) → manda un correo de ejemplo.
    let test = false
    try {
      if (new URL(req.url).searchParams.get('test') === '1') test = true
      const body = await req.json().catch(() => null)
      if (body && body.test === true) test = true
    } catch { /* sin body */ }
    if (test) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: DESTINO,
          subject: 'Prueba · Resumen de faltas · Prepa 21',
          html: '<p>✅ Prueba de configuración del correo de faltas. Si ves esto, el envío funciona.</p>',
        }),
      })
      if (!res.ok) return json({ error: `Resend: ${await res.text()}` }, 500)
      return json({ prueba: true, enviado: true })
    }

    const { data, error } = await supabase.rpc('get_faltas_del_dia')
    if (error) return json({ error: error.message }, 500)
    const faltas = (data ?? []) as Falta[]
    if (faltas.length === 0) return json({ enviado: false, motivo: 'sin faltas hoy' })

    const fecha = new Date().toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    // Agrupar por profesor
    const porProf = new Map<string, Falta[]>()
    for (const f of faltas) {
      const k = `${f.profesor_apellidos}, ${f.profesor_nombre}`
      const arr = porProf.get(k) ?? []
      arr.push(f)
      porProf.set(k, arr)
    }
    const filas = [...porProf.entries()]
      .map(([prof, lista]) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;vertical-align:top">${prof}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${lista
            .map((f) => `${f.materia} · ${hhmm(f.hora_inicio)}–${hhmm(f.hora_fin)}${f.aula ? ` · ${f.aula}` : ''}`)
            .join('<br>')}</td>
        </tr>`)
      .join('')

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111">
      <h2 style="color:#E87722;margin:0 0 4px">Faltas del día · Prepa 21</h2>
      <p style="color:#555;margin:0 0 12px">${cap(fecha)}. Clases sin registro ni justificación:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f7f7f7">
          <th style="text-align:left;padding:8px">Profesor</th>
          <th style="text-align:left;padding:8px">Clases no asistidas</th>
        </tr>
        ${filas}
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px">
        Total: ${faltas.length} falta(s) de ${porProf.size} profesor(es). Enviado automáticamente por el sistema de asistencia.
      </p>
    </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: DESTINO,
        subject: `Faltas del día · ${faltas.length} · Prepa 21`,
        html,
      }),
    })
    if (!res.ok) return json({ error: `Resend: ${await res.text()}` }, 500)
    return json({ enviado: true, faltas: faltas.length, profesores: porProf.size })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
