import { CHATS } from '~/data/chats'
import { MESSAGES } from '~/data/messages'
import type {
  AvatarTone,
  Chat,
  DeliveryStatus,
  FilterKey,
  Message,
} from '~/types/whatsapp'
import type { HistoryPayload, ReceiptStatus, WireUser } from '#shared/types/wire'

/**
 * How the store reaches the network. `useRealtime` installs one of these at
 * boot; until then — during SSR, or with the socket down — outgoing frames go
 * nowhere and the UI still works on local state alone. The store never
 * imports the transport, so the dependency only ever points one way.
 */
export interface ChatTransport {
  sendMessage: (room: string, msg: { wireId: string, text: string, time: string }) => void
  sendTyping: (room: string, on: boolean) => void
  sendReceipt: (room: string, wireIds: string[], status: ReceiptStatus) => void
}

const transport = shallowRef<ChatTransport | null>(null)

export const installChatTransport = (t: ChatTransport | null) => (transport.value = t)

const FILTERS: Record<FilterKey, (c: Chat) => boolean> = {
  all: () => true,
  unread: c => !!c.unread,
  favourites: c => !!c.fav,
  groups: c => !!c.group,
}

export const NOTHING_HERE: Partial<Record<FilterKey, string>> = {
  unread: 'Semua chat sudah dibaca.',
  favourites: 'Belum ada chat favorit. Tandai lewat menu di baris chat.',
  groups: 'Belum ada grup di daftar ini.',
}

/** A bubble the search can look inside; day pills and typing are not. */
export const isMessage = (m: Message) => !m.kind || m.kind === 'call'

function seedThreads(): Record<string, Message[]> {
  let id = 0
  return Object.fromEntries(
    Object.entries(MESSAGES).map(([name, msgs]) => [
      name,
      // Nested objects (quote) get their own copy too, so the seed constant
      // can never be mutated through a thread.
      msgs.map(m => ({ ...m, id: ++id, ...(m.quote ? { quote: { ...m.quote } } : {}) })),
    ]),
  )
}

export function useWhatsappStore() {
  const { showPane } = useWhatsappLayout()
  const { announce } = useWhatsappOverlays()
  const { me } = useIdentity()

  /** Is that name us? Empty during SSR, where nobody has an identity yet. */
  const isMe = (name: string) => sameName(name, me.value.name)

  const chats = useState<Chat[]>('wa:chats', () => CHATS.map(c => ({ ...c })))
  const threads = useState<Record<string, Message[]>>('wa:threads', seedThreads)
  const current = useState<string>('wa:current', () => CHATS[0]!.name)
  const query = useState<string>('wa:query', () => '')
  const activeFilter = useState<FilterKey>('wa:filter', () => 'all')
  /** Bumped whenever the message box should take focus. */
  const composerFocus = useState<number>('wa:composer-focus', () => 0)

  const chatByName = (name: string) => chats.value.find(c => c.name === name)

  const currentChat = computed(() => chatByName(current.value))

  function threadOf(name: string): Message[] {
    if (!threads.value[name]) threads.value[name] = []
    return threads.value[name]!
  }

  const currentThread = computed(() => threads.value[current.value] ?? [])

  /** Ids are handed out from the top of the pile so seeds stay untouched. */
  function nextId(): number {
    let max = 0
    for (const msgs of Object.values(threads.value)) {
      for (const m of msgs) if (m.id > max) max = m.id
    }
    return max + 1
  }

  /* ---------- Chat list bookkeeping ---------- */

  /** Newest first: every update funnels through here so the ordering rule
   *  lives in one place. */
  function bumpToTop(chat: Chat) {
    const i = chats.value.indexOf(chat)
    if (i > 0) chats.value.splice(i, 1)
    if (i !== 0) chats.value.unshift(chat)
  }

  function ensureChat(seed: {
    name: string
    /** Only needed when the room key would read as our own name. */
    title?: string
    av?: AvatarTone
    sub?: string
    preview?: string
    icon?: string
    group?: boolean
  }): Chat {
    const existing = chatByName(seed.name)
    if (!existing) {
      const chat: Chat = {
        name: seed.name,
        title: seed.title,
        av: seed.av || 'a2',
        group: !!seed.group,
        sub: seed.sub || 'online',
        time: clockNow(),
        preview: seed.preview || 'Draft',
        icon: seed.icon || '',
        unread: 0,
      }
      chats.value.unshift(chat)
      return chat
    }
    // Refresh metadata the caller knows more about than we do.
    if (seed.title) existing.title = seed.title
    if (seed.av) existing.av = seed.av
    if (seed.sub) existing.sub = seed.sub
    if (seed.group !== undefined) existing.group = seed.group
    bumpToTop(existing)
    return existing
  }

  /**
   * A label for a room whose key is our own name, given somebody known to be
   * on the other end. Undefined for every ordinary room, which needs none.
   */
  const titleFor = (room: string, other: string | undefined) =>
    isMe(room) && other && !isMe(other) ? other : undefined

  function setPreview(name: string, text: string, icon?: string) {
    const chat = chatByName(name)
    if (!chat) return
    chat.preview = text
    chat.icon = icon || ''
    chat.time = clockNow()
    bumpToTop(chat)
  }

  function bumpUnread(name: string) {
    const chat = chatByName(name)
    if (!chat || name === current.value) return
    chat.unread = (chat.unread || 0) + 1
  }

  function toggleFavourite(name: string): boolean {
    const chat = chatByName(name)
    if (!chat) return false
    chat.fav = !chat.fav
    return !!chat.fav
  }

  /* ---------- Searching + filtering ---------- */

  /* Message-level search runs over the stored thread, so a chat still
     surfaces when the hit is buried in the conversation. */
  function messageHits(name: string, q: string): number {
    if (!q) return 0
    return (threads.value[name] ?? []).filter(
      m => isMessage(m) && (m.text || '').toLowerCase().includes(q),
    ).length
  }

  const normalisedQuery = computed(() => query.value.trim().toLowerCase())

  const visibleChats = computed(() => {
    const q = normalisedQuery.value
    const keep = FILTERS[activeFilter.value] || FILTERS.all
    return chats.value.filter((c) => {
      if (!keep(c)) return false
      if (!q) return true
      // Searched by what the row says, not by the room key behind it.
      return (
        chatTitle(c).toLowerCase().includes(q)
        || (c.preview || '').toLowerCase().includes(q)
        || messageHits(c.name, q) > 0
      )
    })
  })

  const totalUnread = computed(() =>
    chats.value.reduce((n, c) => n + (c.unread || 0), 0),
  )

  function clearSearch() {
    query.value = ''
  }

  /* ---------- Opening + sending ---------- */

  function openChat(name: string) {
    const chat = chatByName(name)
    if (!chat) return
    chat.unread = 0
    current.value = name
    showPane('chat')
    composerFocus.value++
    // Reading a conversation is what turns the sender's ticks blue.
    markRead(name)
  }

  function send(rawText: string) {
    const text = rawText.trim()
    if (!text) return

    const target = current.value
    const time = clockNow()
    const wireId = newWireId()
    // One tick the moment it leaves: the second and the blue pair are the
    // recipient's receipts coming back over the socket.
    const msg: Message = { id: nextId(), wireId, out: true, text, time, status: 'sent' }
    threadOf(target).push(msg)

    setPreview(target, text, 'done_all')
    const chat = chatByName(target)
    if (chat) chat.status = 'sent'

    composerFocus.value++
    transport.value?.sendTyping(target, false)
    transport.value?.sendMessage(target, { wireId, text, time })
  }

  /** A message arrived on the socket. Creates the conversation if it is new. */
  function receiveMessage(frame: { room: string, from: WireUser, wireId: string, text: string, time: string }) {
    const { room, from, text } = frame

    // A message from someone not in the list opens a conversation for them.
    const chat = ensureChat({ name: room, title: titleFor(room, from.name) })
    const msgs = threadOf(room)

    if (msgs.some(m => m.wireId === frame.wireId)) return // socket replay
    // Sending ends the sender's typing indicator.
    dropTyping(room, from.name)
    msgs.push({ id: nextId(), wireId: frame.wireId, from: from.name, text, time: frame.time })

    setPreview(room, chat.group ? `${from.name}: ${text}` : text)
    bumpUnread(room)
    if (room !== current.value) announce(`${from.name}: ${text}`)
  }

  /**
   * Fold stored history — messages and calls alike — into the seeded threads,
   * once, at boot.
   *
   * The seeds stay where they are and persisted entries land after them: they
   * are the newer half of the conversation, and nothing seeded carries an id,
   * so the two can never collide. Anything already in the thread (a socket
   * frame that beat the fetch, or a call this tab just logged) is skipped by
   * that id.
   *
   * Whose entries are ours is decided here rather than on the server: every
   * row carries who sent or placed it, and `meId` is this device.
   */
  function hydrate(payload: HistoryPayload, meId: string) {
    if (!payload?.persisted) return

    // Ids are handed out once instead of per message: `nextId` walks every
    // thread, and history arrives in the hundreds.
    let id = nextId()

    // Oldest activity first, because each `ensureChat` bumps its row to the
    // top — so the list lands newest-first without a second sort.
    for (const room of [...payload.rooms].reverse()) {
      const known = chatByName(room.name)
      const chat = ensureChat({
        name: room.name,
        // A room keyed by our own name is someone else's label for a one-to-one
        // conversation; show it as whoever else has spoken in it.
        title: titleFor(room.name, room.participants.find(p => !isMe(p))),
        // Only caption rooms we are meeting for the first time; a seeded chat
        // already has a better sub-line than a list of names.
        group: known ? undefined : room.participants.length > 2,
        sub: known || room.participants.length < 2 ? undefined : room.participants.join(', '),
      })

      const msgs = threadOf(room.name)
      const seen = new Set<string>()
      for (const m of msgs) {
        if (m.wireId) seen.add(m.wireId)
        if (m.callId) seen.add(m.callId)
      }

      /** What the chat row should end up mirroring: the newest entry. */
      let last: { preview: string, icon: string, status?: DeliveryStatus, time: string } | null = null

      // Optional-chained on purpose: a browser left open across a deploy can
      // be handed a reply from a server that predates this shape.
      for (const entry of payload.entries?.[room.name] ?? []) {
        const key = entry.type === 'msg' ? entry.wireId : entry.callId
        if (seen.has(key)) continue
        seen.add(key)

        if (entry.type === 'call') {
          // Composed from the stored facts, so it reads the same as it did
          // while the call was hanging up.
          const view = callLogView({
            kind: entry.kind,
            outcome: entry.outcome,
            secs: entry.secs,
            mine: entry.from.id === meId,
          })
          const time = clockAt(entry.at)
          msgs.push({
            id: id++,
            callId: entry.callId,
            kind: 'call',
            text: view.text,
            icon: view.icon,
            missed: view.missed,
            time,
          })
          last = { preview: view.preview, icon: view.icon, time }
          continue
        }

        const out = entry.from.id === meId
        msgs.push({
          id: id++,
          wireId: entry.wireId,
          text: entry.text,
          time: entry.time,
          // Ticks belong to our own bubbles; a sender label to everyone else's.
          ...(out ? { out: true, status: entry.status } : { from: entry.from.name }),
        })
        last = {
          preview: out || !chat.group ? entry.text : `${entry.from.name}: ${entry.text}`,
          icon: out ? 'done_all' : '',
          status: out ? entry.status : undefined,
          time: entry.time,
        }
      }

      if (!last) continue

      // The row mirrors the newest entry — with its stored clock, not now.
      chat.preview = last.preview
      chat.icon = last.icon
      if (last.status) chat.status = last.status
      if (last.time) chat.time = last.time
    }
  }

  /** Advance the ticks on our own bubbles. Status never walks backwards. */
  function applyReceipt(room: string, wireIds: string[], status: ReceiptStatus) {
    const msgs = threads.value[room]
    if (!msgs) return

    const wanted = new Set(wireIds)
    let latest: DeliveryStatus | null = null
    for (const m of msgs) {
      if (!m.out || !m.wireId) continue
      if (wanted.has(m.wireId) && m.status !== 'read') m.status = status
      latest = m.status ?? latest
    }

    // The chat row carries the newest outgoing message's ticks.
    const chat = chatByName(room)
    if (chat && chat.icon === 'done_all' && latest) chat.status = latest
  }

  /** Tell the room we have read everything they sent us. */
  function markRead(room: string) {
    const wireIds = (threads.value[room] ?? [])
      .filter(m => !m.out && m.wireId && isMessage(m))
      .map(m => m.wireId!)
    if (wireIds.length) transport.value?.sendReceipt(room, wireIds, 'read')
  }

  /** Confirm receipt of messages that arrived while we were elsewhere. */
  function markDelivered(room: string, wireIds: string[]) {
    if (wireIds.length) transport.value?.sendReceipt(room, wireIds, 'delivered')
  }

  /** Broadcast our own typing state for the open conversation. */
  function notifyTyping(on: boolean) {
    transport.value?.sendTyping(current.value, on)
  }

  /**
   * Show or clear one person's "… is typing" bubble. Driven by the socket's
   * typing frames; nothing else should push or remove typing entries by hand.
   * Tracked per sender, so two people typing in a group show two bubbles.
   */
  function setTyping(room: string, from: string, on: boolean) {
    const msgs = threadOf(room)
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!
      if (m.kind === 'typing' && m.from === from) msgs.splice(i, 1)
    }
    if (on) msgs.push({ id: nextId(), kind: 'typing', from })
  }

  const dropTyping = (room: string, from: string) => setTyping(room, from, false)

  /** Append a call entry to a thread and mirror it in the chat list. */
  function logCall(
    name: string,
    detail: {
      kind: 'voice' | 'video'
      text: string
      missed?: boolean
      preview?: string
      av?: AvatarTone
      /** Who was on the other end, for a room keyed by our own name. */
      other?: string
    },
  ) {
    const icon = detail.missed
      ? 'phone_missed'
      : detail.kind === 'video'
        ? 'videocam'
        : 'call'

    // Works whether or not that chat is on screen.
    threadOf(name).push({
      id: nextId(),
      kind: 'call',
      text: detail.text,
      icon,
      missed: detail.missed,
      time: clockNow(),
    })

    const chat = ensureChat({ name, av: detail.av, title: titleFor(name, detail.other) })
    setPreview(name, detail.preview || detail.text, icon)
    if (detail.missed) bumpUnread(name)
    if (name !== current.value) announce(`${chatTitle(chat)}: ${detail.text}`)
  }

  return {
    chats,
    threads,
    current,
    currentChat,
    currentThread,
    query,
    normalisedQuery,
    activeFilter,
    composerFocus,
    visibleChats,
    totalUnread,
    chatByName,
    threadOf,
    ensureChat,
    setPreview,
    bumpUnread,
    toggleFavourite,
    messageHits,
    clearSearch,
    openChat,
    send,
    setTyping,
    dropTyping,
    logCall,
    // Realtime seam
    hydrate,
    receiveMessage,
    applyReceipt,
    markRead,
    markDelivered,
    notifyTyping,
  }
}
