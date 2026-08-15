/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging background worker.
 *
 * Must live at the origin root, and it is a plain static file — so it cannot
 * read Nuxt's runtime config. `usePush` registers it with the Firebase keys on
 * the query string and it reads them back off its own location.
 *
 * This handler only runs when the page is NOT in the foreground; when the tab
 * is visible, FCM routes the same message to `onMessage` in the app instead.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {}
  const title = payload.notification?.title || data.room || 'New message'
  const body = payload.notification?.body || ''

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    // One notification per conversation rather than a pile per message.
    tag: data.room || 'chat',
    renotify: true,
    data: { room: data.room || '' },
  })
})

// Clicking the notification focuses an open tab on that conversation, or
// opens one if none is running.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const room = event.notification.data?.room || ''
  const target = room ? `/?room=${encodeURIComponent(room)}` : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-room', room })
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
