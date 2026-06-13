// Edge Function: promueve o degrada el rol de un profesor.
// Escribe app_metadata.rol (la fuente que valida RLS vía is_admin()) y lo
// espeja en profesores.admin para que la interfaz —que no puede leer el
// app_metadata de otros usuarios— pueda mostrar el rol correctamente.
//
// Desplegar con:  supabase functions deploy set-profesor-rol

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
    const {
      data: { user: quienLlama },
    } = await caller.auth.getUser()
    const { data: esAdmin, error: errAdmin } = await caller.rpc('is_admin')
    if (errAdmin || !esAdmin || !quienLlama) {
      return json({ error: 'Solo un administrador puede cambiar roles' }, 403)
    }

    const { user_id, rol } = (await req.json()) as {
      user_id?: string
      rol?: 'admin' | 'profesor'
    }
    if (!user_id || (rol !== 'admin' && rol !== 'profesor')) {
      return json({ error: 'Parámetros inválidos: se requiere user_id y rol válido' }, 400)
    }

    // 2. Un admin no puede degradarse a sí mismo (evita quedarse sin admins)
    if (user_id === quienLlama.id && rol !== 'admin') {
      return json({ error: 'No puedes quitarte el rol de administrador a ti mismo' }, 400)
    }

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 3. Escribir app_metadata.rol (toma efecto al renovar el token del usuario)
    const { error: errMeta } = await admin.auth.admin.updateUserById(user_id, {
      app_metadata: { rol },
    })
    if (errMeta) return json({ error: errMeta.message }, 400)

    // 4. Espejar en profesores.admin para la interfaz e is_admin()
    const { error: errFicha } = await admin
      .from('profesores')
      .update({ admin: rol === 'admin' })
      .eq('user_id', user_id)
    if (errFicha) return json({ error: errFicha.message }, 400)

    return json({ ok: true, rol })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
