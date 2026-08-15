import type { CallSignal, ClientMessage, ServerMessage } from '#shared/types/wire'

/**
 * The WebSocket half of messaging: everything that happens while the tab is
 * open. Push (see `usePush`) covers the rest.
 *
 * The socket is the only thing here that talks to the network; the store is
 * told what arrived and asked for what to send, so nothing in the UI knows a
 * transport exists.
 */
export type RealtimeStatus = 'idle' | 'connecting' | 'online' | 'offline'

const status = ref<RealtimeStatus>('idle')

// Connection state is per-tab and client-only, so module scope is safe.
let socket: WebSocket | null = null
let attempt = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let closedOnPurpose = false
const outbox: ClientMessage[] = []
const joined = new Set<string>()

const MAX_BACKOFF = 15_000

function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}/_ws`
}

export function useRealtime() {
  const store = useWhatsappStore()
  // Resolved here, during setup, because `handle` runs from a socket event
  // where there is no Nuxt instance to look a composable up against.
  const calls = useCallCenter()
  const { me, restore } = useIdentity()

  const isOnline = computed(() => status.value === 'online')

  function post(frame: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame))
      return
    }
    // Hold on to it: the queue drains on the next successful open, so a
    // message typed during a reconnect is not silently dropped.
    outbox.push(frame)
    if (outbox.length > 200) outbox.shift()
  }

  function flush() {
    while (outbox.length && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(outbox.shift()))
    }
  }

  const roomNames = () => store.chats.value.map(c => c.name)

  function handle(frame: ServerMessage) {
    switch (frame.t) {
      case 'ready':
        status.value = 'online'
        break

      case 'msg': {
        store.receiveMessage(frame)
        // Two ticks the moment it lands on this device…
        store.markDelivered(frame.room, [frame.wireId])
        // …and blue if the reader is looking at that conversation right now.
        if (frame.room === store.current.value && document.visibilityState === 'visible') {
          store.markRead(frame.room)
        }
        break
      }

      case 'typing':
        store.setTyping(frame.room, frame.from.name, frame.on)
        break

      case 'receipt':
        store.applyReceipt(frame.room, frame.wireIds, frame.status)
        break

      case 'call':
        // WebRTC signalling. Nothing but the handshake travels this way; the
        // audio and video go straight between the two browsers.
        void calls.handleCall(frame)
        break

      case 'error':
        console.warn('[realtime]', frame.message)
        break
    }
  }

  function scheduleRetry() {
    if (closedOnPurpose || retryTimer) return
    // Exponential backoff with jitter, so a server restart does not bring
    // every open tab back in the same millisecond.
    const wait = Math.min(MAX_BACKOFF, 2 ** attempt * 1000)
    attempt++
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, wait + Math.random() * 400)
  }

  function connect() {
    if (!import.meta.client) return
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

    closedOnPurpose = false
    status.value = 'connecting'
    const ws = new WebSocket(socketUrl())
    socket = ws

    ws.onopen = () => {
      attempt = 0
      const rooms = roomNames()
      joined.clear()
      for (const room of rooms) joined.add(room)
      ws.send(JSON.stringify({ t: 'hello', user: restore(), rooms } satisfies ClientMessage))
      flush()
    }

    ws.onmessage = (event) => {
      try {
        handle(JSON.parse(event.data as string) as ServerMessage)
      }
      catch {
        // A frame we cannot parse is not worth tearing the socket down for.
      }
    }

    ws.onclose = () => {
      if (socket === ws) socket = null
      status.value = closedOnPurpose ? 'idle' : 'offline'
      scheduleRetry()
    }

    ws.onerror = () => ws.close()
  }

  function disconnect() {
    closedOnPurpose = true
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    socket?.close()
    socket = null
    status.value = 'idle'
  }

  /** Subscribe to conversations that appeared after the opening handshake. */
  function syncRooms() {
    const fresh = roomNames().filter(name => !joined.has(name))
    if (!fresh.length) return
    for (const name of fresh) joined.add(name)
    post({ t: 'join', rooms: fresh })
  }

  const transport = {
    sendMessage: (room: string, msg: { wireId: string, text: string, time: string }) =>
      post({ t: 'msg', room, ...msg }),
    sendTyping: (room: string, on: boolean) => post({ t: 'typing', room, on }),
    sendReceipt: (room: string, wireIds: string[], receipt: 'delivered' | 'read') =>
      post({ t: 'receipt', room, wireIds, status: receipt }),
    sendCall: (room: string, signal: CallSignal, to?: string) =>
      post({ t: 'call', room, to, signal }),
  }

  return { status, isOnline, me, connect, disconnect, syncRooms, transport }
}
