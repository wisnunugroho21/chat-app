/** Avatar palette classes defined in `assets/css/whatsapp.css` (.a1 … .a6). */
export type AvatarTone = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'

export type DeliveryStatus = 'sent' | 'delivered' | 'read'

export type FilterKey = 'all' | 'unread' | 'favourites' | 'groups'

/** Defined on the wire, because signalling and the UI must agree on it. */
export type { CallKind } from '#shared/types/wire'

export interface Contact {
  name: string
  about: string
  av: AvatarTone
}

export interface Chat {
  name: string
  av: AvatarTone
  /** Overrides the initials derived from the name. */
  initials?: string
  group?: boolean
  sub?: string
  time: string
  preview: string
  /** Material symbol shown before the preview; `done_all` renders ticks. */
  icon?: string
  status?: DeliveryStatus
  unread: number
  fav?: boolean
}

export interface Quote {
  author: string
  text: string
}

/**
 * One entry per bubble. Plain objects with no markup in them, so the same
 * seed could just as well arrive from an API.
 *   { text, time }                     — incoming
 *   { out: true, text, time }          — outgoing (ticks added)
 *   { from }                           — sender label in groups
 *   { quote: { author, text } }        — replied-to snippet
 *   { photo: true }                    — image attachment
 *   { kind: "day" | "call" | "typing" }
 * Use **double asterisks** inside text for bold.
 */
export interface Message {
  id: number
  /** Globally unique id carried over the wire; receipts address it. */
  wireId?: string
  kind?: 'day' | 'call' | 'typing'
  label?: string
  text?: string
  time?: string
  out?: boolean
  from?: string
  quote?: Quote
  photo?: boolean
  icon?: string
  missed?: boolean
  status?: DeliveryStatus
}

/** A row rendered by the thread: bubbles plus the separators around them. */
export type ThreadEntry =
  | { key: string, type: 'day', label: string }
  | { key: string, type: 'notice' }
  | { key: string, type: 'empty' }
  | { key: string, type: 'call', message: Message }
  | { key: string, type: 'typing', message: Message }
  | { key: string, type: 'bubble', message: Message, first: boolean, showSender: boolean, senderClass: string }

export interface MenuItem {
  icon: string
  label: string
  run: (anchor: HTMLElement) => void
}

export interface CallFace {
  av: AvatarTone
  initials: string
}

export interface Call {
  /** Who the call screen names — the caller, or the chat being called. */
  name: string
  /** The conversation the signalling travels through, which for an incoming
   *  call from a group is not the same as `name`. */
  room: string
  face: CallFace
  kind: CallKind
  direction: 'in' | 'out'
  secs: number
  muted: boolean
  /** Our own camera. */
  cam: boolean
  /** Theirs, as last reported — false paints their avatar over the video. */
  remoteCam: boolean
  speaker: boolean
  answered: boolean
  connected: boolean
  /** The demo ringer in the sidebar: a call screen with no peer behind it. */
  simulated?: boolean
}
