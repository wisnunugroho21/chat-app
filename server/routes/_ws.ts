import type { CallSignal, ClientMessage, ServerMessage, WireUser } from '#shared/types/wire'

/**
 * The realtime socket.
 *
 * Fan-out is crossws' pub/sub: one topic per conversation, and `publish`
 * reaches every other subscriber but never the sender — which is what we
 * want, since the sender already painted its own bubble.
 *
 * Push is the other half. A socket only reaches tabs that are open, so every
 * message also goes out over FCM to the room's registered tokens; the service
 * worker drops it when the page turns out to be in the foreground.
 */

const topic = (room: string) => `room:${room}`
/** Every peer also listens on its own id, so a frame can address one user. */
const userTopic = (userId: string) => `user:${userId}`

const send = (peer: { send: (data: string) => unknown }, payload: ServerMessage): void => {
  peer.send(JSON.stringify(payload))
}

/** Frames arrive from the network: check the shape before trusting it. */
function parse(raw: string): ClientMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const frame = data as Record<string, unknown>
  return typeof frame.t === 'string' ? (frame as ClientMessage) : null
}

const asUser = (value: unknown): WireUser | null => {
  const user = value as WireUser | undefined
  if (!user || typeof user.id !== 'string' || typeof user.name !== 'string') return null
  return { id: user.id.slice(0, 64), name: user.name.slice(0, 64) }
}

const asRooms = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(r => typeof r === 'string' && r).slice(0, 200) : []

const SIGNALS = new Set(['invite', 'ring', 'accept', 'offer', 'answer', 'ice', 'media', 'end'])

/**
 * Call frames are relayed without being understood — the SDP is a private
 * matter between two browsers — so this only checks that the envelope is well
 * formed and that nobody is pushing a megabyte through the socket.
 */
function asSignal(value: unknown): CallSignal | null {
  const signal = value as (CallSignal & { sdp?: unknown }) | undefined
  if (!signal || typeof signal !== 'object') return null
  if (typeof signal.s !== 'string' || !SIGNALS.has(signal.s)) return null
  if (typeof signal.callId !== 'string' || !signal.callId) return null
  if ('sdp' in signal && (typeof signal.sdp !== 'string' || signal.sdp.length > 64_000)) return null
  return signal
}

export default defineWebSocketHandler({
  open() {
    // Nothing to do until `hello` names the peer — `ready` is the reply to it,
    // so a client only counts itself online once its identity has landed.
  },

  async message(peer, message) {
    const frame = parse(message.text())
    if (!frame) return

    if (frame.t === 'hello') {
      const user = asUser(frame.user)
      if (!user) return send(peer, { t: 'error', message: 'hello needs a user' })

      const rooms = asRooms(frame.rooms)
      identify(peer.id, user, rooms)
      for (const room of rooms) peer.subscribe(topic(room))
      peer.subscribe(userTopic(user.id))
      return send(peer, { t: 'ready', user, rooms })
    }

    const session = sessionOf(peer.id)
    if (!session) return send(peer, { t: 'error', message: 'say hello first' })

    switch (frame.t) {
      case 'join': {
        const rooms = asRooms(frame.rooms)
        joinRooms(peer.id, rooms)
        for (const room of rooms) peer.subscribe(topic(room))
        break
      }

      case 'msg': {
        if (typeof frame.room !== 'string' || typeof frame.text !== 'string') break
        const text = frame.text.slice(0, 4096)
        const payload: ServerMessage = {
          t: 'msg',
          room: frame.room,
          from: session.user,
          wireId: String(frame.wireId),
          text,
          time: String(frame.time),
        }
        peer.publish(topic(frame.room), JSON.stringify(payload))
        // Delivery first, storage second: neither Mongo nor FCM being down is
        // allowed to hold up the tabs that are already listening.
        await saveMessage({
          room: frame.room,
          from: session.user,
          wireId: payload.wireId,
          text,
          time: payload.time,
        })
        await pushToRoom(frame.room, session.user, text, payload.wireId)
        break
      }

      case 'typing': {
        if (typeof frame.room !== 'string') break
        peer.publish(
          topic(frame.room),
          JSON.stringify({ t: 'typing', room: frame.room, from: session.user, on: !!frame.on } satisfies ServerMessage),
        )
        break
      }

      case 'receipt': {
        if (typeof frame.room !== 'string' || !Array.isArray(frame.wireIds)) break
        const wireIds = frame.wireIds.map(String).slice(0, 500)
        const status = frame.status === 'read' ? 'read' : 'delivered'
        peer.publish(
          topic(frame.room),
          JSON.stringify({ t: 'receipt', room: frame.room, wireIds, status } satisfies ServerMessage),
        )
        // So a reload shows the ticks the sender had already earned.
        await saveReceipts(frame.room, wireIds, status)
        break
      }

      case 'call': {
        if (typeof frame.room !== 'string') break
        const signal = asSignal(frame.signal)
        if (!signal) break
        // Routing is the frame's to decide, not ours: addressed to a user, or
        // to the room when it is an invite looking for whoever picks up.
        const target = typeof frame.to === 'string' && frame.to
          ? userTopic(frame.to)
          : topic(frame.room)
        peer.publish(
          target,
          JSON.stringify({ t: 'call', room: frame.room, from: session.user, signal } satisfies ServerMessage),
        )
        break
      }
    }
  },

  close(peer) {
    forget(peer.id)
  },

  error(peer) {
    forget(peer.id)
  },
})

/** Notify the room's registered devices. Never lets push break delivery. */
async function pushToRoom(room: string, from: WireUser, text: string, wireId: string) {
  const tokens = await tokensForRoom(room, from.id)
  if (!tokens.length) return
  try {
    await sendChatPush({
      tokens,
      title: room,
      body: `${from.name}: ${text}`,
      data: { room, from: from.name, wireId },
    })
  }
  catch (error) {
    console.error('[fcm] push failed', error)
  }
}
