// Edge Function: process-notification-queue
// Triggered by: pg_cron every 5 minutes
// Processes scheduled reminders (24h, 30min), missed appointment detection,
// and post-appointment follow-ups

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SEND_NOTIFICATION_URL =
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`

async function dispatchNotification(type: string, appointmentId: string) {
  const res = await fetch(SEND_NOTIFICATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ type, appointment_id: appointmentId }),
  })
  return res.ok
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

  const now = new Date().toISOString()

  // Fetch all unprocessed queue items due right now
  const { data: queueItems, error } = await supabase
    .from('notification_queue')
    .select('*')
    .eq('processed', false)
    .lte('scheduled_for', now)
    .limit(50)

  if (error) {
    console.error('Queue fetch error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Processing ${queueItems?.length ?? 0} queue items`)

  const results = []

  for (const item of queueItems ?? []) {
    let success = false

    try {
      if (item.notification_type === 'missed_check') {
        // Special handling: check if appointment was actually missed
        const { data: apt } = await supabase
          .from('appointments')
          .select('id, status, start_time, end_time')
          .eq('id', item.appointment_id)
          .single()

        if (apt && (apt.status === 'pending' || apt.status === 'confirmed')) {
          const endTime = new Date(apt.end_time)
          const now = new Date()

          // Only mark as missed if end time has passed
          if (now > endTime) {
            // Mark appointment as missed
            await supabase
              .from('appointments')
              .update({ status: 'missed' })
              .eq('id', apt.id)

            // Send missed notifications (DB webhook will fire, but also dispatch directly
            // in case webhook is slow)
            success = await dispatchNotification('missed_appointment', apt.id)
          } else {
            // Appointment hasn't ended yet — not missed
            success = true
          }
        } else {
          // Appointment was cancelled or already marked — skip
          success = true
        }
      } else {
        // Standard notification types: reminder_24h, reminder_30min, post_appointment
        // Check that appointment wasn't cancelled
        const { data: apt } = await supabase
          .from('appointments')
          .select('status')
          .eq('id', item.appointment_id)
          .single()

        if (!apt || apt.status === 'cancelled') {
          success = true // Skip — appointment was cancelled
        } else {
          success = await dispatchNotification(item.notification_type, item.appointment_id)
        }
      }
    } catch (err) {
      console.error(`Error processing item ${item.id}:`, err)
      success = false
    }

    // Mark as processed regardless (prevent infinite retry loops)
    // For failures, the notification_log table holds the error details
    await supabase
      .from('notification_queue')
      .update({ processed: true })
      .eq('id', item.id)

    results.push({ id: item.id, type: item.notification_type, success })
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
