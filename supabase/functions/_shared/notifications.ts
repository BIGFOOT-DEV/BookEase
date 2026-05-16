// Shared email templates and utilities for BookEase notifications
// Used by all Edge Functions

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://bookease.vercel.app'
export const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'BookEase <no-reply@bookease.resend.dev>'
export const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
export const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
export const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

// ── ICS calendar file generator ───────────────────────────────────────────────
export function generateICS(params: {
  uid: string
  summary: string
  description: string
  location: string
  startTime: Date
  endTime: Date
  organizerEmail: string
  organizerName: string
}): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BookEase//BookEase//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}@bookease.app`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(params.startTime)}`,
    `DTEND:${fmt(params.endTime)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${params.location}`,
    `ORGANIZER;CN="${params.organizerName}":mailto:${params.organizerEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment reminder - tomorrow',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

// ── Resend email sender ────────────────────────────────────────────────────────
export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html: string
  attachments?: Array<{ filename: string; content: string; type: string }>
}): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const body: Record<string, unknown> = {
    from: EMAIL_FROM,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
  }

  if (params.attachments?.length) {
    body.attachments = params.attachments.map((a) => ({
      filename: a.filename,
      content: btoa(a.content), // base64
      type: a.type,
    }))
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
    return { success: false, error: err }
  }

  return { success: true }
}

// ── Web Push sender ───────────────────────────────────────────────────────────
export async function sendPush(params: {
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  url?: string
  icon?: string
}): Promise<{ success: boolean; error?: string }> {
  // We use the Supabase Edge Function's built-in fetch to call the push endpoint
  // VAPID signing is done manually since we can't use npm web-push in Deno
  // For simplicity, we call a helper that does the VAPID JWT signing
  try {
    const payload = JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url ?? APP_URL,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
    })

    // Build VAPID Authorization header
    const vapidHeaders = await buildVapidHeaders(
      params.endpoint,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
    )

    const res = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        ...vapidHeaders,
        'Content-Type': 'application/json',
        'Content-Length': String(payload.length),
        TTL: '86400',
      },
      body: payload,
    })

    if (res.status === 410 || res.status === 404) {
      // Subscription expired — caller should delete it
      return { success: false, error: 'subscription_expired' }
    }

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: err }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── VAPID JWT builder (Deno-compatible, no npm) ───────────────────────────────
async function buildVapidHeaders(
  endpoint: string,
  publicKey: string,
  privateKey: string,
): Promise<Record<string, string>> {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const subject = `mailto:no-reply@bookease.app`

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 12 * 3600

  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp, sub: subject }

  const encHeader = base64url(JSON.stringify(header))
  const encPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encHeader}.${encPayload}`

  // Import the private key (.slice() ensures Uint8Array<ArrayBuffer> for BufferSource compat)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    base64urlDecode(privateKey).slice(),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const token = `${signingInput}.${base64url(new Uint8Array(signature))}`

  return {
    Authorization: `vapid t=${token}, k=${publicKey}`,
  }
}

function base64url(data: string | Uint8Array): string {
  const str =
    typeof data === 'string'
      ? btoa(data)
      : btoa(String.fromCharCode(...data))
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  return new Uint8Array(bin.split('').map((c) => c.charCodeAt(0)))
}

// ── HTML Email Templates ──────────────────────────────────────────────────────

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f8fafc;
  margin: 0; padding: 0;
`
const cardStyle = `
  background: white; border-radius: 12px; padding: 32px;
  max-width: 560px; margin: 32px auto;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
`
const logoStyle = `font-size: 22px; font-weight: 700; color: #6366f1; margin-bottom: 24px;`
const h1Style = `font-size: 22px; font-weight: 700; color: #1e293b; margin: 0 0 8px;`
const pStyle = `font-size: 15px; color: #64748b; line-height: 1.6; margin: 0 0 16px;`
const detailBoxStyle = `background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0;`
const btnStyle = `
  display: inline-block; background: #6366f1; color: white;
  padding: 12px 28px; border-radius: 8px; text-decoration: none;
  font-weight: 600; font-size: 15px; margin: 8px 4px;
`
const dangerBtnStyle = btnStyle.replace('#6366f1', '#ef4444')
const footerStyle = `font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;`

function emailWrapper(content: string): string {
  return `<!DOCTYPE html><html><body style="${baseStyle}">
    <div style="${cardStyle}">
      <div style="${logoStyle}">📅 BookEase</div>
      ${content}
    </div>
    <p style="${footerStyle}">BookEase · Automated notification · Do not reply to this email</p>
  </body></html>`
}

// Booking Confirmation (Customer)
export function emailBookingConfirmedCustomer(params: {
  customerName: string
  businessName: string
  serviceName: string
  date: string
  time: string
  duration: number
  notes?: string
  appointmentId: string
}): string {
  return emailWrapper(`
    <h1 style="${h1Style}">Booking Confirmed! 🎉</h1>
    <p style="${pStyle}">Hi ${params.customerName}, your appointment has been submitted.</p>

    <div style="${detailBoxStyle}">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Business:</strong> ${params.businessName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Service:</strong> ${params.serviceName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Date:</strong> ${params.date}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Time:</strong> ${params.time}
      </p>
      <p style="margin:0;font-size:14px;color:#475569;">
        <strong>Duration:</strong> ${params.duration} minutes
      </p>
      ${params.notes ? `<p style="margin:8px 0 0;font-size:14px;color:#475569;"><strong>Notes:</strong> ${params.notes}</p>` : ''}
    </div>

    <p style="${pStyle}">
      A calendar invite (.ics) is attached — add it to your calendar to get reminded automatically.
    </p>
    <a href="${APP_URL}/my-bookings" style="${btnStyle}">View My Bookings</a>
  `)
}

// New Booking Alert (Business)
export function emailNewBookingBusiness(params: {
  businessName: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  serviceName: string
  date: string
  time: string
  duration: number
  notes?: string
  appointmentId: string
}): string {
  return emailWrapper(`
    <h1 style="${h1Style}">New Booking Request 📬</h1>
    <p style="${pStyle}">You have a new appointment request on BookEase.</p>

    <div style="${detailBoxStyle}">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Customer:</strong> ${params.customerName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Email:</strong> ${params.customerEmail}
      </p>
      ${params.customerPhone ? `<p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong>Phone:</strong> ${params.customerPhone}</p>` : ''}
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Service:</strong> ${params.serviceName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Date:</strong> ${params.date}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Time:</strong> ${params.time}
      </p>
      <p style="margin:0;font-size:14px;color:#475569;">
        <strong>Duration:</strong> ${params.duration} minutes
      </p>
      ${params.notes ? `<p style="margin:8px 0 0;font-size:14px;color:#475569;"><strong>Notes:</strong> ${params.notes}</p>` : ''}
    </div>

    <a href="${APP_URL}/dashboard/appointments" style="${btnStyle}">Confirm Appointment</a>
  `)
}

// Status Update (Customer — confirmed or cancelled)
export function emailStatusUpdate(params: {
  customerName: string
  businessName: string
  serviceName: string
  date: string
  time: string
  status: 'confirmed' | 'cancelled'
}): string {
  const isConfirmed = params.status === 'confirmed'
  return emailWrapper(`
    <h1 style="${h1Style}">
      ${isConfirmed ? 'Appointment Confirmed ✅' : 'Appointment Cancelled ❌'}
    </h1>
    <p style="${pStyle}">
      Hi ${params.customerName},
      ${isConfirmed
        ? `your appointment with ${params.businessName} has been confirmed.`
        : `your appointment with ${params.businessName} has been cancelled.`}
    </p>

    <div style="${detailBoxStyle}">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Service:</strong> ${params.serviceName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Date:</strong> ${params.date}
      </p>
      <p style="margin:0;font-size:14px;color:#475569;">
        <strong>Time:</strong> ${params.time}
      </p>
    </div>

    ${isConfirmed
      ? `<a href="${APP_URL}/my-bookings" style="${btnStyle}">View Booking</a>`
      : `<a href="${APP_URL}/explore" style="${btnStyle}">Book Again</a>`}
  `)
}

// Reminder (Customer)
export function emailReminder(params: {
  customerName: string
  businessName: string
  serviceName: string
  date: string
  time: string
  duration: number
  timeUntil: string // e.g. "24 hours" or "30 minutes"
}): string {
  return emailWrapper(`
    <h1 style="${h1Style}">Appointment Reminder ⏰</h1>
    <p style="${pStyle}">
      Hi ${params.customerName}, your appointment is in <strong>${params.timeUntil}</strong>.
    </p>

    <div style="${detailBoxStyle}">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Business:</strong> ${params.businessName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Service:</strong> ${params.serviceName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Date:</strong> ${params.date}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Time:</strong> ${params.time}
      </p>
      <p style="margin:0;font-size:14px;color:#475569;">
        <strong>Duration:</strong> ${params.duration} minutes
      </p>
    </div>
  `)
}

// Missed Appointment (Business)
export function emailMissedBusiness(params: {
  businessName: string
  customerName: string
  customerEmail: string
  serviceName: string
  date: string
  time: string
}): string {
  return emailWrapper(`
    <h1 style="${h1Style}">Missed Appointment 📋</h1>
    <p style="${pStyle}">
      The following customer did not show up for their appointment.
    </p>

    <div style="${detailBoxStyle}">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Customer:</strong> ${params.customerName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Email:</strong> ${params.customerEmail}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Service:</strong> ${params.serviceName}
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>Date:</strong> ${params.date}
      </p>
      <p style="margin:0;font-size:14px;color:#475569;">
        <strong>Time:</strong> ${params.time}
      </p>
    </div>

    <a href="${APP_URL}/dashboard/appointments" style="${btnStyle}">View Appointments</a>
  `)
}

// Missed Appointment Follow-up (Customer)
export function emailMissedCustomer(params: {
  customerName: string
  businessName: string
  serviceName: string
  date: string
}): string {
  return emailWrapper(`
    <h1 style="${h1Style}">We missed you! 💙</h1>
    <p style="${pStyle}">
      Hi ${params.customerName}, it looks like you weren't able to make your appointment
      with ${params.businessName} for ${params.serviceName} on ${params.date}.
    </p>
    <p style="${pStyle}">
      No worries — you can easily rebook at a time that works better for you.
    </p>
    <a href="${APP_URL}/explore" style="${btnStyle}">Rebook Now</a>
  `)
}

// Post-Appointment + Rating Request (Customer)
export function emailPostAppointment(params: {
  customerName: string
  businessName: string
  serviceName: string
  appointmentId: string
}): string {
  const ratingUrl = (stars: number) =>
    `${APP_URL}/rate/${params.appointmentId}?stars=${stars}`

  return emailWrapper(`
    <h1 style="${h1Style}">How was your appointment? ⭐</h1>
    <p style="${pStyle}">
      Hi ${params.customerName}, we hope your appointment with 
      <strong>${params.businessName}</strong> for ${params.serviceName} went well!
    </p>
    <p style="${pStyle}">
      Take 5 seconds to rate your experience — it helps ${params.businessName} 
      grow and helps other customers make informed choices.
    </p>

    <div style="text-align:center;margin:24px 0;">
      <p style="font-size:14px;color:#64748b;margin-bottom:12px;">Tap a star to rate:</p>
      <div style="font-size:28px;letter-spacing:4px;">
        ${[1,2,3,4,5].map((s) => `<a href="${ratingUrl(s)}" style="text-decoration:none;">⭐</a>`).join('')}
      </div>
      <div style="margin-top:8px;">
        ${[1,2,3,4,5].map((s) => `<a href="${ratingUrl(s)}" style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;font-size:12px;color:#6366f1;font-weight:600;">${s}</a>`).join('')}
      </div>
    </div>

    <p style="${pStyle}">
      Want to book again?
    </p>
    <a href="${APP_URL}/explore" style="${btnStyle}">Book Another Appointment</a>
  `)
}

// Daily Digest (Business)
export function emailDailyDigest(params: {
  businessName: string
  date: string
  appointments: Array<{
    customerName: string
    serviceName: string
    time: string
    duration: number
    status: string
  }>
}): string {
  const rows = params.appointments
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${a.time}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;">${a.customerName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;">${a.serviceName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;">${a.duration} min</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;">
          <span style="background:${a.status === 'confirmed' ? '#dcfce7' : '#fef3c7'};color:${a.status === 'confirmed' ? '#166534' : '#92400e'};padding:2px 8px;border-radius:99px;font-weight:600;">
            ${a.status}
          </span>
        </td>
      </tr>
    `,
    )
    .join('')

  const emptyRow = `
    <tr>
      <td colspan="5" style="padding:32px;text-align:center;color:#94a3b8;font-size:14px;">
        No appointments scheduled for tomorrow.
      </td>
    </tr>
  `

  return emailWrapper(`
    <h1 style="${h1Style}">📅 Tomorrow's Schedule</h1>
    <p style="${pStyle}">
      Hi ${params.businessName}, here's your appointment summary for 
      <strong>${params.date}</strong>.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Time</th>
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Customer</th>
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Service</th>
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Duration</th>
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${params.appointments.length > 0 ? rows : emptyRow}
      </tbody>
    </table>

    <a href="${APP_URL}/dashboard/appointments" style="${btnStyle}">View Full Schedule</a>
  `)
}
