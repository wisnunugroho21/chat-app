import type { Messaging } from 'firebase/messaging'
import type { PushData } from '#shared/types/wire'

/**
 * Firebase Cloud Messaging, browser half — the delivery path for when the tab
 * is not open, which is exactly what a WebSocket cannot cover.
 *
 * The Firebase SDK is imported dynamically: it is large, and nothing here is
 * needed until someone actually turns notifications on.
 *
 * Foreground messages still arrive here (FCM delivers them to `onMessage`
 * rather than the worker), and they duplicate what the socket already
 * delivered — `store.receiveMessage` drops repeats by `wireId`.
 */
export type PushState = 'unsupported' | 'unconfigured' | 'idle' | 'denied' | 'ready'

const state = ref<PushState>('idle')
const token = ref<string | null>(null)
let messaging: Messaging | null = null

export function usePush() {
  const store = useWhatsappStore()
  const { me, restore } = useIdentity()
  const config = useRuntimeConfig().public.firebase

  const configured = computed(() =>
    !!(config?.apiKey && config?.projectId && config?.appId && config?.vapidKey),
  )

  const enabled = computed(() => state.value === 'ready')

  /**
   * The worker is a static file, so it cannot read runtime config. Hand it the
   * Firebase keys on the query string and let it read them back off its own
   * location — the standard way to configure a messaging worker.
   */
  function registerWorker(): Promise<ServiceWorkerRegistration> {
    const params = new URLSearchParams({
      apiKey: config.apiKey,
      authDomain: config.authDomain || '',
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId || '',
      appId: config.appId,
    })
    return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, { scope: '/' })
  }

  async function init(): Promise<Messaging | null> {
    if (messaging) return messaging
    if (!import.meta.client) return null

    if (!configured.value) {
      state.value = 'unconfigured'
      return null
    }

    const [{ initializeApp, getApps }, { getMessaging, isSupported }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ])

    if (!(await isSupported())) {
      state.value = 'unsupported'
      return null
    }

    const app = getApps()[0] ?? initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    })
    messaging = getMessaging(app)
    return messaging
  }

  /** Mint a token and hand it to the server. Assumes permission is granted. */
  async function register(): Promise<boolean> {
    const fcm = await init()
    if (!fcm) return false

    const { getToken, onMessage } = await import('firebase/messaging')
    const registration = await registerWorker()

    const fresh = await getToken(fcm, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    })
    if (!fresh) {
      state.value = 'idle'
      return false
    }

    token.value = fresh
    await $fetch('/api/push/register', {
      method: 'POST',
      body: { token: fresh, user: restore(), rooms: store.chats.value.map(c => c.name) },
    })

    // Foreground delivery: the worker stays quiet, so fold it into the thread.
    onMessage(fcm, (payload) => {
      const data = payload.data as unknown as PushData | undefined
      if (!data?.room || !data.wireId) return
      store.receiveMessage({
        room: data.room,
        from: { id: data.wireId, name: data.from },
        wireId: data.wireId,
        text: payload.notification?.body?.replace(`${data.from}: `, '') ?? '',
        time: clockNow(),
      })
    })

    state.value = 'ready'
    return true
  }

  /** Ask the browser for permission, then register. Needs a user gesture. */
  async function enable(): Promise<PushState> {
    if (!import.meta.client) return state.value
    if (!('Notification' in window)) {
      state.value = 'unsupported'
      return state.value
    }
    if (!configured.value) {
      state.value = 'unconfigured'
      return state.value
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      state.value = 'denied'
      return state.value
    }

    await register()
    return state.value
  }

  async function disable() {
    if (!token.value) return
    const fcm = await init()
    if (fcm) {
      const { deleteToken } = await import('firebase/messaging')
      await deleteToken(fcm).catch(() => {})
    }
    await $fetch('/api/push/unregister', { method: 'POST', body: { token: token.value } }).catch(() => {})
    token.value = null
    state.value = 'idle'
  }

  /**
   * Boot-time pass: pick the token back up when permission was already granted
   * on an earlier visit, without prompting anyone.
   */
  async function resume() {
    if (!import.meta.client) return
    if (!configured.value) {
      state.value = 'unconfigured'
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      state.value = 'unsupported'
      return
    }
    if (Notification.permission === 'denied') {
      state.value = 'denied'
      return
    }
    if (Notification.permission !== 'granted') return // wait to be asked
    await register().catch(error => console.warn('[push] resume failed', error))
  }

  /** Keep the server's room list for this token in step with the chat list. */
  async function syncRooms() {
    if (!token.value) return
    await $fetch('/api/push/register', {
      method: 'POST',
      body: { token: token.value, user: me.value, rooms: store.chats.value.map(c => c.name) },
    }).catch(() => {})
  }

  return { state, token, configured, enabled, enable, disable, resume, syncRooms }
}
