// BookEase notification client-side helpers
// Handles browser push subscription and service worker registration

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// ── Service Worker Registration ───────────────────────────────────────────────
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('BookEase SW registered:', reg.scope)
    return reg
  } catch (err) {
    console.error('SW registration failed:', err)
    return null
  }
}

// ── Push Permission & Subscription ───────────────────────────────────────────
export async function requestPushPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return await Notification.requestPermission()
}

export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPushPermissionStatus() {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Subscribe to browser push notifications.
 * Saves the subscription to Supabase.
 * @param userToken - Supabase auth JWT (if logged in), null for guests
 * @param guestEmail - guest customer email (if not logged in)
 */
export async function subscribeToPush(userToken = null, guestEmail = null) {
  if (!isPushSupported()) {
    return { success: false, error: 'Push not supported in this browser' }
  }

  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not set — push disabled')
    return { success: false, error: 'Push not configured' }
  }

  const permission = await requestPushPermission()
  if (permission !== 'granted') {
    return { success: false, error: 'Permission denied' }
  }

  try {
    const reg = await registerServiceWorker()
    if (!reg) return { success: false, error: 'Service worker not available' }

    // Wait for SW to be ready
    await navigator.serviceWorker.ready

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const { endpoint } = subscription
    const keys = subscription.toJSON().keys

    // Save to Supabase
    const headers = {
      'Content-Type': 'application/json',
    }
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`
    }

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/save-push-subscription`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          guest_email: guestEmail,
        }),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: err }
    }

    return { success: true, subscription }
  } catch (err) {
    console.error('Push subscription error:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Unsubscribe from browser push notifications.
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return

  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return

    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch (err) {
    console.error('Unsubscribe error:', err)
  }
}

// ── ICS Calendar File Generator ───────────────────────────────────────────────
export function generateICS({ uid, summary, description, startTime, endTime, businessName }) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const now = fmt(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BookEase//BookEase//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@bookease.app`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmt(new Date(startTime))}`,
    `DTEND:${fmt(new Date(endTime))}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${businessName || ''}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment tomorrow',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}

/**
 * Trigger download of an ICS file in the browser.
 */
export function downloadICS(icsContent, filename = 'appointment.ics') {
  const blob = new Blob([icsContent], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
