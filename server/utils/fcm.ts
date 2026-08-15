import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { PushData } from '#shared/types/wire'

/**
 * Firebase Cloud Messaging, server half.
 *
 * The whole module is optional: with no service account in the environment
 * `sendChatPush` returns `{ sent: 0, skipped: true }` and the app runs on the
 * socket alone. That keeps `pnpm dev` working on a fresh clone, and keeps the
 * socket path from failing because push is misconfigured.
 */

let messaging: ReturnType<typeof getMessaging> | null = null
let warned = false

function client() {
  if (messaging) return messaging

  const { fcm } = useRuntimeConfig()
  const projectId = fcm?.projectId
  const clientEmail = fcm?.clientEmail
  // Env vars flatten the PEM's newlines; put them back.
  const privateKey = fcm?.privateKey?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    if (!warned) {
      warned = true
      console.info(
        '[fcm] no service account configured — push disabled, sockets still deliver. '
        + 'Set NUXT_FCM_PROJECT_ID, NUXT_FCM_CLIENT_EMAIL and NUXT_FCM_PRIVATE_KEY to turn it on.',
      )
    }
    return null
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  messaging = getMessaging(app)
  return messaging
}

export interface ChatPush {
  tokens: string[]
  title: string
  body: string
  data: PushData
}

export async function sendChatPush(push: ChatPush) {
  if (!push.tokens.length) return { sent: 0, skipped: false }

  const fcm = client()
  if (!fcm) return { sent: 0, skipped: true }

  const response = await fcm.sendEachForMulticast({
    tokens: push.tokens,
    // `data` is what the service worker reads; the notification block is the
    // fallback the browser renders if the worker never wakes.
    notification: { title: push.title, body: push.body },
    data: { ...push.data },
    webpush: {
      notification: {
        icon: '/favicon.ico',
        tag: push.data.room, // one notification per conversation, not per message
        renotify: true,
      },
      fcmOptions: { link: '/' },
    },
  })

  // FCM reports tokens that belong to uninstalled or expired registrations;
  // holding on to them means every later send retries a dead address.
  const dead = response.responses.flatMap((r, i) => {
    const code = r.error?.code
    const gone
      = code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument'
    return gone ? [push.tokens[i]!] : []
  })
  if (dead.length) await pruneTokens(dead)

  return { sent: response.successCount, skipped: false, dead: dead.length }
}
