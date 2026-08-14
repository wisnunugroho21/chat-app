import type { Chat } from '~/types/whatsapp'

/** Clock label for a message that was just created. */
export function clockNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

export const faceInitials = (chat: Chat): string => chat.initials || initials(chat.name)

export const callDuration = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
