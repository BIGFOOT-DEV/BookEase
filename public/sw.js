// BookEase Service Worker
// Handles Web Push notification delivery when the browser tab is closed

const CACHE_NAME = 'bookease-v1'

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = {
      title: 'BookEase',
      body: event.data.text(),
      url: '/',
    }
  }

  const { title, body, url, icon, badge } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      data: { url: url || '/' },
      requireInteraction: false,
      vibrate: [200, 100, 200],
      tag: 'bookease-notification',
      renotify: true,
    }),
  )
})

// ── Notification click handler ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is open, focus the window and navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus()
            if ('navigate' in client) {
              client.navigate(targetUrl)
            }
            return
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      }),
  )
})

// ── Install & activate (minimal caching) ─────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
