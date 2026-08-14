import { CHATS } from '~/data/chats'
import { MESSAGES } from '~/data/messages'
import type {
  AvatarTone,
  Chat,
  DeliveryStatus,
  FilterKey,
  Message,
} from '~/types/whatsapp'

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
    if (seed.av) existing.av = seed.av
    if (seed.sub) existing.sub = seed.sub
    if (seed.group !== undefined) existing.group = seed.group
    bumpToTop(existing)
    return existing
  }

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
      return (
        c.name.toLowerCase().includes(q)
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
  }

  /** Move one message on to its next tick state. */
  function advance(msg: Message, name: string, status: DeliveryStatus, delay: number) {
    setTimeout(() => {
      if (msg.status === status) return
      msg.status = status
      const chat = chatByName(name)
      if (chat && chat.icon === 'done_all') chat.status = status
    }, delay)
  }

  function send(rawText: string) {
    const text = rawText.trim()
    if (!text) return

    const target = current.value
    const msg: Message = { id: nextId(), out: true, text, time: clockNow(), status: 'sent' }
    threadOf(target).push(msg)

    setPreview(target, text, 'done_all')
    const chat = chatByName(target)
    if (chat) chat.status = 'sent'

    composerFocus.value++
    advance(msg, target, 'delivered', 700)
    advance(msg, target, 'read', 2200)
  }

  /**
   * Show or clear the "… is typing" bubble for a conversation. Wire this to a
   * presence event; nothing else should push or remove typing entries by hand.
   */
  function setTyping(name: string, from?: string) {
    const msgs = threadOf(name)
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.kind === 'typing') msgs.splice(i, 1)
    }
    if (from) msgs.push({ id: nextId(), kind: 'typing', from })
  }

  /** Append a call entry to a thread and mirror it in the chat list. */
  function logCall(
    name: string,
    detail: { kind: 'voice' | 'video', text: string, missed?: boolean, preview?: string, av?: AvatarTone },
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

    ensureChat({ name, av: detail.av })
    setPreview(name, detail.preview || detail.text, icon)
    if (detail.missed) bumpUnread(name)
    if (name !== current.value) announce(`${name}: ${detail.text}`)
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
    logCall,
  }
}
