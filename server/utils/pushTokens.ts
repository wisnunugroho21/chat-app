import type { WireUser } from '#shared/types/wire'

/**
 * FCM registration tokens, keyed by token.
 *
 * Tokens are long-lived and outlive the tab that minted them, so this is the
 * store that most wants a database: without one, every server restart silences
 * push until each browser happens to re-register. Mongo holds them when it is
 * configured; the in-memory map below is the fallback, and keeps a fresh clone
 * working with no environment at all.
 */

interface Registration {
  user: WireUser
  rooms: Set<string>
  seen: number
}

const memory = new Map<string, Registration>()

export async function registerToken(token: string, user: WireUser, rooms: string[]) {
  const db = await chatCollections()
  if (db) {
    // Re-registering is the normal case — the same browser hands back the same
    // token every boot, with whatever room list it now has.
    await db.tokens.updateOne(
      { token },
      { $set: { user, rooms, seen: new Date() }, $setOnInsert: { token } },
      { upsert: true },
    )
    return
  }
  memory.set(token, { user, rooms: new Set(rooms), seen: Date.now() })
}

export async function unregisterToken(token: string) {
  const db = await chatCollections()
  if (db) {
    await db.tokens.deleteOne({ token })
    return
  }
  memory.delete(token)
}

/** Drop tokens FCM has told us are dead. */
export async function pruneTokens(dead: string[]) {
  if (!dead.length) return
  const db = await chatCollections()
  if (db) {
    await db.tokens.deleteMany({ token: { $in: dead } })
    return
  }
  for (const token of dead) memory.delete(token)
}

/**
 * Tokens that should hear about a message in `room`, minus the sender's own
 * devices — a push to the author is noise, not a notification.
 */
export async function tokensForRoom(room: string, exceptUserId: string): Promise<string[]> {
  const db = await chatCollections()
  if (db) {
    const docs = await db.tokens
      .find({ rooms: room, 'user.id': { $ne: exceptUserId } }, { projection: { token: 1, _id: 0 } })
      .toArray()
    return docs.map(d => d.token)
  }

  const out: string[] = []
  for (const [token, reg] of memory) {
    if (reg.user.id === exceptUserId) continue
    if (!reg.rooms.has(room)) continue
    out.push(token)
  }
  return out
}
