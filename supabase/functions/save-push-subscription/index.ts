// Edge Function: save-push-subscription
// Called from the browser when user opts into Web Push notifications
// Stores their VAPID push subscription in the database

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { endpoint, p256dh, auth, guest_email } = await req.json()

    if (!endpoint || !p256dh || !auth) {
      return new Response(
        JSON.stringify({ error: 'Missing subscription fields' }),
        { status: 400 },
      )
    }

    // Resolve user_id from the auth header (if logged in)
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id ?? null
    }

    // Upsert the subscription (endpoint is unique)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        guest_email: userId ? null : (guest_email ?? null),
        endpoint,
        p256dh,
        auth,
      }, { onConflict: 'endpoint' })

    if (error) {
      console.error('DB error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('save-push-subscription error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
