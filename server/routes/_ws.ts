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

/**
 * One frame at a time per peer.
 *
 * `hello` resolves an account over the network, and crossws hands us the next
 * frame without waiting — so a `join` sent immediately behind it would arrive
 * while the handshake was still in flight, find no session, and be turned away
 * with "say hello first". Chaining the handlers keeps a connection's frames in
 * the order the client sent them, which is the order it is entitled to.
 */
const queues = new Map<string, Promise<void>>()

function serialise(peerId: string, run: () => Promise<void>): Promise<void> {
  const previous = queues.get(peerId) ?? Promise.resolve()
  // A frame that threw must not wedge every frame behind it.
  const next = previous.catch(() => {}).then(run)
  queues.set(peerId, next)
  return next
}

export default defineWebSocketHandler({
  open() {
    // Nothing to do until `hello` names the peer — `ready` is the reply to it,
    // so a client only counts itself online once its identity has landed.
  },

  message(peer, message) {
    const raw = message.text()
    // A throw here would otherwise vanish into an unhandled rejection, and a
    // failed handshake would look exactly like a silent one.
    return serialise(peer.id, () => handleFrame(peer, raw).catch((error) => {
      console.error('[ws] frame handler failed', error)
    }))
  },

  close(peer) {
    forget(peer.id)
    queues.delete(peer.id)
  },

  error(peer) {
    forget(peer.id)
    queues.delete(peer.id)
  },
})

type Peer = Parameters<NonNullable<Parameters<typeof defineWebSocketHandler>[0]['message']>>[0]

async function handleFrame(peer: Peer, raw: string) {
  const frame = parse(raw)
  if (!frame) return

  if (frame.t === 'hello') {
    // The ticket is the whole authentication step: it was minted for one
    // account, it is spent here, and the identity comes from the store —
    // never from the frame.
    const ticket = typeof frame.ticket === 'string' ? frame.ticket : ''
    const redeemed = ticket ? redeemTicket(ticket) : null
    // Anything thrown here would leave the peer silently unidentified, and
    // every later frame answering "say hello first" with no explanation.
    const account = await (redeemed ? findById(redeemed) : Promise.resolve(null))
      .catch((error) => {
        console.error('[ws] could not resolve the account behind a ticket', error)
        return null
      })
    if (!account) return send(peer, { t: 'error', message: 'hello needs a valid ticket' })

    const user: WireUser = { id: account.id, name: account.name }
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
      // Relay first, then write the log — the far end should not wait on
      // the database to hear a phone ring.
      await recordCallSignal(frame.room, session.user, signal)
      break
    }
  }
}

/** Notify the room's registered devices. Never lets push break delivery. */
async function pushToRoom(room: string, from: WireUser, text: string, wireId: string) {
  const tokens = await tokensForRoom(room, from.id)
  if (!tokens.length) return
  try {
  await sendChatPush({
    tokens,
    title: room,
    body: `${from.name}: ${text}`,
    data: { room, from: from.name, fromId: from.id, wireId },
  })
  }
  catch (error) {
  console.error('[fcm] push failed', error)
  }
}
