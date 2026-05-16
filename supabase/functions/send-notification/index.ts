// Edge Function: send-notification
// Triggered by: DB webhook (appointment INSERT/UPDATE) and notification queue processor
// Sends email + push notifications for all booking lifecycle events

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  sendEmail,
  sendPush,
  generateICS,
  emailBookingConfirmedCustomer,
  emailNewBookingBusiness,
  emailStatusUpdate,
  emailReminder,
  emailMissedBusiness,
  emailMissedCustomer,
  emailPostAppointment,
} from '../_shared/notifications.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

async function getPushSubscriptions(
  userId: string | null,
  guestEmail: string | null,
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  if (!userId && !guestEmail) return []

  const q = supabase.from('push_subscriptions').select('endpoint, p256dh, auth')
  if (userId) q.eq('user_id', userId)
  else if (guestEmail) q.eq('guest_email', guestEmail)

  const { data } = await q
  return data ?? []
}

async function logNotification(params: {
  appointmentId: string
  userId: string | null
  type: string
  channel: 'email' | 'push'
  status: 'sent' | 'failed'
  error?: string
}) {
  await supabase.from('notification_log').insert({
    appointment_id: params.appointmentId,
    user_id: params.userId,
    notification_type: params.type,
    channel: params.channel,
    status: params.status,
    error_message: params.error ?? null,
    sent_at: params.status === 'sent' ? new Date().toISOString() : null,
  })
}

async function pushToUser(params: {
  userId: string | null
  guestEmail: string | null
  title: string
  body: string
  url?: string
  appointmentId: string
  type: string
}) {
  const subs = await getPushSubscriptions(params.userId, params.guestEmail)
  for (const sub of subs) {
    const result = await sendPush({
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      title: params.title,
      body: params.body,
      url: params.url,
    })

    await logNotification({
      appointmentId: params.appointmentId,
      userId: params.userId,
      type: params.type,
      channel: 'push',
      status: result.success ? 'sent' : 'failed',
      error: result.error,
    })

    // Clean up expired subscriptions
    if (result.error === 'subscription_expired') {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint)
    }
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

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
    const body = await req.json()

    // Support both direct calls { type, appointment_id }
    // and Supabase DB webhook format { type: 'INSERT'|'UPDATE', record: {...} }
    let notificationType: string
    let appointmentId: string

    if (body.record && body.type) {
      // DB Webhook format
      const record = body.record
      const oldRecord = body.old_record

      if (body.type === 'INSERT') {
        notificationType = 'booking_created'
      } else if (body.type === 'UPDATE' && record.status !== oldRecord?.status) {
        if (record.status === 'confirmed') notificationType = 'booking_confirmed'
        else if (record.status === 'cancelled') notificationType = 'booking_cancelled'
        else if (record.status === 'missed') notificationType = 'missed_appointment'
        else {
          return new Response(JSON.stringify({ skipped: true }), { status: 200 })
        }
      } else {
        return new Response(JSON.stringify({ skipped: true }), { status: 200 })
      }
      appointmentId = record.id
    } else {
      // Direct call format
      notificationType = body.type
      appointmentId = body.appointment_id
    }

    // ── Fetch appointment details ─────────────────────────────────────────────
    const { data: apt, error: aptErr } = await supabase
      .from('appointments')
      .select(`
        *,
        services(name, duration_minutes),
        business:profiles!appointments_business_id_fkey(id, full_name, email, slug),
        customer:profiles!appointments_customer_id_fkey(id, full_name, email)
      `)
      .eq('id', appointmentId)
      .single()

    if (aptErr || !apt) {
      console.error('Appointment not found:', aptErr)
      return new Response(JSON.stringify({ error: 'appointment not found' }), { status: 404 })
    }

    const startTime = new Date(apt.start_time)
    const endTime = new Date(apt.end_time)
    const dateStr = formatDate(startTime)
    const timeStr = `${formatTime(startTime)} – ${formatTime(endTime)}`
    const businessName = apt.business?.full_name ?? 'the business'
    const customerName = apt.customer_name
    const customerEmail = apt.customer_email
    const serviceName = apt.services?.name ?? 'appointment'
    const duration = apt.services?.duration_minutes ?? 30
    const customerId = apt.customer_id ?? null
    const businessId = apt.business_id
    const businessEmail = apt.business?.email ?? null

    // ── Generate ICS attachment (for booking_created) ─────────────────────────
    const icsContent = generateICS({
      uid: apt.id,
      summary: `${serviceName} with ${businessName}`,
      description: `Appointment booked via BookEase.\nService: ${serviceName}\nDuration: ${duration} minutes`,
      location: businessName,
      startTime,
      endTime,
      organizerEmail: businessEmail ?? 'no-reply@bookease.resend.dev',
      organizerName: businessName,
    })

    // ── Send notifications based on type ──────────────────────────────────────
    switch (notificationType) {

      case 'booking_created': {
        // 1. Email customer — confirmation + ICS
        const customerHtml = emailBookingConfirmedCustomer({
          customerName, businessName, serviceName,
          date: dateStr, time: timeStr, duration,
          notes: apt.notes ?? undefined,
          appointmentId: apt.id,
        })
        const emailRes = await sendEmail({
          to: customerEmail,
          subject: `✅ Booking Confirmed — ${serviceName} with ${businessName}`,
          html: customerHtml,
          attachments: [{
            filename: 'appointment.ics',
            content: icsContent,
            type: 'text/calendar',
          }],
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: emailRes.success ? 'sent' : 'failed',
          error: emailRes.error,
        })

        // 2. Email business — new booking alert
        if (businessEmail) {
          const bizHtml = emailNewBookingBusiness({
            businessName, customerName,
            customerEmail, customerPhone: apt.customer_phone?.toString(),
            serviceName, date: dateStr, time: timeStr, duration,
            notes: apt.notes ?? undefined, appointmentId: apt.id,
          })
          await sendEmail({
            to: businessEmail,
            subject: `📬 New Booking: ${customerName} — ${serviceName}`,
            html: bizHtml,
          })
        }

        // 3. Push to customer
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: '✅ Booking Confirmed!',
          body: `${serviceName} with ${businessName} on ${dateStr}`,
          url: `${Deno.env.get('APP_URL')}/my-bookings`,
          appointmentId: apt.id, type: notificationType,
        })

        // 4. Push to business
        await pushToUser({
          userId: businessId, guestEmail: null,
          title: '📬 New Booking Request',
          body: `${customerName} booked ${serviceName} for ${dateStr}`,
          url: `${Deno.env.get('APP_URL')}/dashboard/appointments`,
          appointmentId: apt.id, type: `${notificationType}_business`,
        })

        // 5. Schedule reminders in queue
        await scheduleReminders(apt.id, startTime, endTime)
        break
      }

      case 'booking_confirmed': {
        const html = emailStatusUpdate({
          customerName, businessName, serviceName,
          date: dateStr, time: timeStr, status: 'confirmed',
        })
        const res = await sendEmail({
          to: customerEmail,
          subject: `✅ Appointment Confirmed — ${businessName}`,
          html,
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: res.success ? 'sent' : 'failed', error: res.error,
        })
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: '✅ Appointment Confirmed!',
          body: `${businessName} confirmed your ${serviceName} appointment.`,
          appointmentId: apt.id, type: notificationType,
        })
        break
      }

      case 'booking_cancelled': {
        const html = emailStatusUpdate({
          customerName, businessName, serviceName,
          date: dateStr, time: timeStr, status: 'cancelled',
        })
        const res = await sendEmail({
          to: customerEmail,
          subject: `❌ Appointment Cancelled — ${businessName}`,
          html,
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: res.success ? 'sent' : 'failed', error: res.error,
        })
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: '❌ Appointment Cancelled',
          body: `Your ${serviceName} with ${businessName} has been cancelled.`,
          appointmentId: apt.id, type: notificationType,
        })
        break
      }

      case 'reminder_24h': {
        const html = emailReminder({
          customerName, businessName, serviceName,
          date: dateStr, time: timeStr, duration, timeUntil: '24 hours',
        })
        const res = await sendEmail({
          to: customerEmail,
          subject: `⏰ Reminder: ${serviceName} tomorrow with ${businessName}`,
          html,
          attachments: [{
            filename: 'appointment.ics',
            content: icsContent,
            type: 'text/calendar',
          }],
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: res.success ? 'sent' : 'failed', error: res.error,
        })
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: '⏰ Appointment Tomorrow',
          body: `${serviceName} with ${businessName} at ${formatTime(startTime)}`,
          appointmentId: apt.id, type: notificationType,
        })
        break
      }

      case 'reminder_30min': {
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: '⏰ Appointment in 30 Minutes',
          body: `${serviceName} with ${businessName} starting soon!`,
          appointmentId: apt.id, type: notificationType,
        })
        break
      }

      case 'missed_appointment': {
        // Notify business
        if (businessEmail) {
          const bizHtml = emailMissedBusiness({
            businessName, customerName, customerEmail,
            serviceName, date: dateStr, time: timeStr,
          })
          await sendEmail({
            to: businessEmail,
            subject: `📋 Missed Appointment: ${customerName}`,
            html: bizHtml,
          })
        }
        await pushToUser({
          userId: businessId, guestEmail: null,
          title: '📋 Missed Appointment',
          body: `${customerName} did not show up for ${serviceName}`,
          url: `${Deno.env.get('APP_URL')}/dashboard/appointments`,
          appointmentId: apt.id, type: `${notificationType}_business`,
        })

        // Notify customer (we missed you!)
        const customerHtml = emailMissedCustomer({
          customerName, businessName, serviceName, date: dateStr,
        })
        const res = await sendEmail({
          to: customerEmail,
          subject: `We missed you — ${businessName}`,
          html: customerHtml,
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: res.success ? 'sent' : 'failed', error: res.error,
        })
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: 'We missed you! 💙',
          body: `Rebook your ${serviceName} with ${businessName}`,
          url: `${Deno.env.get('APP_URL')}/explore`,
          appointmentId: apt.id, type: `${notificationType}_customer`,
        })
        break
      }

      case 'post_appointment': {
        const html = emailPostAppointment({
          customerName, businessName, serviceName, appointmentId: apt.id,
        })
        const res = await sendEmail({
          to: customerEmail,
          subject: `How was your appointment? ⭐ — ${businessName}`,
          html,
        })
        await logNotification({
          appointmentId: apt.id, userId: customerId,
          type: notificationType, channel: 'email',
          status: res.success ? 'sent' : 'failed', error: res.error,
        })
        await pushToUser({
          userId: customerId, guestEmail: customerEmail,
          title: 'How was your appointment? ⭐',
          body: `Rate your experience with ${businessName}`,
          url: `${Deno.env.get('APP_URL')}/rate/${apt.id}`,
          appointmentId: apt.id, type: notificationType,
        })
        break
      }

      default:
        console.warn('Unknown notification type:', notificationType)
    }

    return new Response(JSON.stringify({ success: true, type: notificationType }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-notification error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

// ── Schedule reminders when a new appointment is created ─────────────────────
async function scheduleReminders(
  appointmentId: string,
  startTime: Date,
  endTime: Date,
) {
  const now = new Date()
  const entries = []

  const h24 = new Date(startTime.getTime() - 24 * 60 * 60 * 1000)
  if (h24 > now) {
    entries.push({ appointment_id: appointmentId, notification_type: 'reminder_24h', scheduled_for: h24.toISOString() })
  }

  const m30 = new Date(startTime.getTime() - 30 * 60 * 1000)
  if (m30 > now) {
    entries.push({ appointment_id: appointmentId, notification_type: 'reminder_30min', scheduled_for: m30.toISOString() })
  }

  // Missed appointment check: 15 minutes after end time
  const missedCheck = new Date(endTime.getTime() + 15 * 60 * 1000)
  entries.push({
    appointment_id: appointmentId,
    notification_type: 'missed_check',
    scheduled_for: missedCheck.toISOString(),
  })

  // Post-appointment follow-up: 1 hour after end
  const followUp = new Date(endTime.getTime() + 60 * 60 * 1000)
  entries.push({
    appointment_id: appointmentId,
    notification_type: 'post_appointment',
    scheduled_for: followUp.toISOString(),
  })

  if (entries.length > 0) {
    await supabase.from('notification_queue').insert(entries)
  }
}
