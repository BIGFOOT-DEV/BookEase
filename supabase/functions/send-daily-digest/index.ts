// Edge Function: send-daily-digest
// Triggered by: pg_cron every day at 7:00 AM UTC (8:00 AM WAT)
// Sends tomorrow's appointment schedule to all business accounts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail, emailDailyDigest } from '../_shared/notifications.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Tomorrow's date window (UTC)
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)

  const dayAfter = new Date(tomorrow)
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)

  // Get all businesses that have digest enabled
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('digest_enabled', true)
    .eq('email_enabled', true)

  const businessIds = (prefs ?? []).map((p) => p.user_id)

  // Also include all businesses that haven't set preferences (default = on)
  const { data: allBusinesses } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'business')
    .not('email', 'is', null)

  const digested = new Set<string>()
  let sentCount = 0

  for (const biz of allBusinesses ?? []) {
    // Skip if they've explicitly disabled digest
    const hasPref = prefs?.some((p) => p.user_id === biz.id)
    if (hasPref && !businessIds.includes(biz.id)) continue
    if (digested.has(biz.id)) continue
    digested.add(biz.id)

    // Fetch tomorrow's appointments for this business
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*, services(name, duration_minutes)')
      .eq('business_id', biz.id)
      .gte('start_time', tomorrow.toISOString())
      .lt('start_time', dayAfter.toISOString())
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })

    const apptList = (appointments ?? []).map((a) => ({
      customerName: a.customer_name,
      serviceName: a.services?.name ?? 'Appointment',
      time: formatTime(new Date(a.start_time)),
      duration: a.services?.duration_minutes ?? 30,
      status: a.status,
    }))

    const html = emailDailyDigest({
      businessName: biz.full_name,
      date: formatDate(tomorrow),
      appointments: apptList,
    })

    const res = await sendEmail({
      to: biz.email!,
      subject: `📅 Tomorrow's Schedule — ${formatDate(tomorrow)}`,
      html,
    })

    if (res.success) sentCount++
    else console.error(`Failed to send digest to ${biz.email}:`, res.error)
  }

  return new Response(
    JSON.stringify({ success: true, sent: sentCount }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
