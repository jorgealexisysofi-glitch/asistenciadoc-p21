// Edge Function: resetea la contraseña de un profesor a la temporal compartida
// y marca su ficha con password_temporal = true para forzar el cambio en el
// próximo inicio de sesión.
//
// Desplegar con:  supabase functions deploy reset-profesor-password
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY están disponibles
//  automáticamente en el runtime de Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2'

const PASSWORD_TEMPORAL = 'Prepa21@2026'

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

    // 1. Verificar que quien llama es admin (con su propio JWT y la anon key).
    //    is_admin() valida app_metadata.rol === 'admin' (y profesores.admin).
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: esAdmin, error: errAdmin } = await caller.rpc('is_admin')
    if (errAdmin || !esAdmin) {
      return json({ error: 'Solo un administrador puede resetear contraseñas' }, 403)
    }

    const { profesor_id, user_id } = (await req.json()) as {
      profesor_id?: string
      user_id?: string
    }
    if (!profesor_id || !user_id) {
      return json({ error: 'Faltan profesor_id o user_id' }, 400)
    }

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 2. Restablecer la contraseña a la temporal
    const { error: errPwd } = await admin.auth.admin.updateUserById(user_id, {
      password: PASSWORD_TEMPORAL,
    })
    if (errPwd) return json({ error: errPwd.message }, 400)

    // 3. Forzar el cambio en el próximo login
    const { error: errFicha } = await admin
      .from('profesores')
      .update({ password_temporal: true })
      .eq('id', profesor_id)
    if (errFicha) return json({ error: errFicha.message }, 400)

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
