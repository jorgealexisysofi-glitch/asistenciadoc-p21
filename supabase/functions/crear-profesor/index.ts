// Edge Function: crea la cuenta de Supabase Auth de un profesor recién dado de
// alta, le envía el correo de bienvenida (invitación para fijar contraseña) y
// vincula user_id en su ficha de `profesores`.
//
// Desplegar con:  supabase functions deploy crear-profesor
// (las variables SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//  están disponibles automáticamente en el runtime de Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!

    // 1. Verificar que quien llama es admin (con su propio JWT y la anon key)
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: esAdmin, error: errAdmin } = await caller.rpc('is_admin')
    if (errAdmin || !esAdmin) {
      return json({ error: 'Solo un administrador puede crear cuentas' }, 403)
    }

    const { profesor_id, correo } = (await req.json()) as {
      profesor_id?: string
      correo?: string
    }
    if (!profesor_id || !correo) {
      return json({ error: 'Faltan profesor_id o correo' }, 400)
    }

    // 2. Invitar con el service role: crea el usuario con contraseña temporal
    //    aleatoria y envía el correo de bienvenida para establecer la suya
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: invitado, error: errInvite } =
      await admin.auth.admin.inviteUserByEmail(correo)
    if (errInvite) return json({ error: errInvite.message }, 400)

    // 3. Vincular la cuenta a la ficha del profesor
    const { error: errLink } = await admin
      .from('profesores')
      .update({ user_id: invitado.user.id })
      .eq('id', profesor_id)
    if (errLink) return json({ error: errLink.message }, 400)

    return json({ ok: true, user_id: invitado.user.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
