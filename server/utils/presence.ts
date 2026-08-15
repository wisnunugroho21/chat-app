import type { WireUser } from '#shared/types/wire'

/**
 * Who is on which socket. Fan-out itself is crossws' pub/sub — this only
 * remembers the identity behind a peer, which the socket frames do not carry
 * after the opening `hello`.
 *
 * In-memory, so it is per-process: fine for one server, and the thing to swap
 * for Redis (or any shared pub/sub) before running more than one.
 */
interface Session {
  user: WireUser
  rooms: Set<string>
}

const sessions = new Map<string, Session>()

export function identify(peerId: string, user: WireUser, rooms: string[]) {
  sessions.set(peerId, { user, rooms: new Set(rooms) })
}

export function forget(peerId: string) {
  sessions.delete(peerId)
}

export function sessionOf(peerId: string): Session | undefined {
  return sessions.get(peerId)
}

export function joinRooms(peerId: string, rooms: string[]) {
  const session = sessions.get(peerId)
  if (!session) return
  for (const room of rooms) session.rooms.add(room)
}

/** Ids of the users currently holding a socket open on a room. */
export function usersInRoom(room: string): Set<string> {
  const out = new Set<string>()
  for (const session of sessions.values()) {
    if (session.rooms.has(room)) out.add(session.user.id)
  }
  return out
}
