import type { Chat } from '~/types/whatsapp'
import type { CallKind, CallOutcome } from '#shared/types/wire'

const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }

/** Clock label for a message that was just created. */
export function clockNow(): string {
  return new Date().toLocaleTimeString([], CLOCK)
}

/** Clock label for a moment the server recorded, in the reader's own zone. */
export function clockAt(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleTimeString([], CLOCK)
}

/** Globally unique id for one message, so receipts can address it. */
export function newWireId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0] || name).slice(0, 2).toUpperCase()
}

/** What a conversation is called on screen, as opposed to on the wire. */
export const chatTitle = (chat: Chat): string => chat.title || chat.name

export const faceInitials = (chat: Chat): string => chat.initials || initials(chatTitle(chat))

/** Loose name comparison: identities are typed by hand, so trim and fold. */
export const sameName = (a: string, b: string): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export const callDuration = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** One word for how a call that never connected came to an end. */
export function callOutcomeLabel(outcome: CallOutcome, mine: boolean): string {
  switch (outcome) {
    case 'declined': return 'Declined'
    case 'busy': return 'Busy'
    case 'failed': return 'Failed'
    // The same call reads differently from each end.
    case 'missed': return mine ? 'Unanswered' : 'Missed'
    case 'cancelled': return mine ? 'Cancelled' : 'Missed'
    default: return 'Ended'
  }
}

export interface CallLogView {
  text: string
  icon: string
  missed: boolean
  /** What the chat list shows: the duration alone, once it was answered. */
  preview: string
}

/**
 * How one call reads in a thread.
 *
 * The stored record keeps the facts and the wording is composed here, per
 * reader — which is what lets a live call and the same call after a reload
 * say exactly the same thing. `mine` is whether this device placed it.
 */
export function callLogView(call: {
  kind: CallKind
  outcome: CallOutcome
  secs: number
  mine: boolean
}): CallLogView {
  if (call.outcome === 'answered') {
    const duration = callDuration(call.secs)
    return {
      text: `${call.kind === 'video' ? 'Video' : 'Voice'} call · ${duration}`,
      icon: call.kind === 'video' ? 'videocam' : 'call',
      missed: false,
      preview: duration,
    }
  }

  const text = `${callOutcomeLabel(call.outcome, call.mine)} ${call.kind} call`
  return { text, icon: 'phone_missed', missed: true, preview: text }
}

/** Split on **double asterisks** so bold can be rendered without v-html. */
export function boldSegments(text: string): { text: string, bold: boolean }[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((chunk, i) => ({ text: chunk, bold: i % 2 === 1 }))
    .filter(seg => seg.text !== '')
}

/** Split a string around every case-insensitive occurrence of `query`. */
export function markSegments(text: string, query: string): { text: string, hit: boolean }[] {
  if (!query) return [{ text, hit: false }]
  const hay = text.toLowerCase()
  const out: { text: string, hit: boolean }[] = []
  let i = 0
  for (;;) {
    const at = hay.indexOf(query, i)
    if (at < 0) {
      if (i < text.length) out.push({ text: text.slice(i), hit: false })
      return out
    }
    if (at > i) out.push({ text: text.slice(i, at), hit: false })
    out.push({ text: text.slice(at, at + query.length), hit: true })
    i = at + query.length
  }
}
