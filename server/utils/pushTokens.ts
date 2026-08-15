import type { WireUser } from '#shared/types/wire'

/**
 * FCM registration tokens, keyed by token.
 *
 * In-memory like the presence map, and for the same reason: it is the seam
 * where a real deployment drops in a database. Tokens are long-lived and
 * survive the tab that minted them, so persisting them is what makes push
 * work after a restart.
 */
interface Registration {
  user: WireUser
  rooms: Set<string>
  seen: number
}

const tokens = new Map<string, Registration>()

export function registerToken(token: string, user: WireUser, rooms: string[]) {
  tokens.set(token, { user, rooms: new Set(rooms), seen: Date.now() })
}

export function unregisterToken(token: string) {
  tokens.delete(token)
}

/** Drop tokens FCM has told us are dead. */
export function pruneTokens(dead: string[]) {
  for (const token of dead) tokens.delete(token)
}

/**
 * Tokens that should hear about a message in `room`, minus the sender's own
 * devices — a push to the author is noise, not a notification.
 */
export function tokensForRoom(room: string, exceptUserId: string): string[] {
  const out: string[] = []
  for (const [token, reg] of tokens) {
    if (reg.user.id === exceptUserId) continue
    if (!reg.rooms.has(room)) continue
    out.push(token)
  }
  return out
}

export const tokenCount = () => tokens.size
