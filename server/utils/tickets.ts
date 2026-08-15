import { randomUUID } from 'node:crypto'

/**
 * One-shot tickets for the WebSocket handshake.
 *
 * The socket cannot ask for the session the way an endpoint can, and letting
 * the first frame simply claim an identity — which is what it used to do —
 * would leave the whole thing open to anyone willing to type someone else's
 * name. So the browser spends its cookie on an ordinary authenticated request,
 * gets a ticket, and the socket presents that instead.
 *
 * Short-lived and single-use, so a ticket that leaks is worth almost nothing,
 * and in memory because that is exactly as long as it needs to outlive.
 */

interface Ticket {
  userId: string
  expires: number
}

/**
 * Parked on `globalThis`, not in a module-level `const`.
 *
 * The endpoint that mints a ticket and the socket route that spends it are
 * separate entry points, and Nitro re-evaluates server modules per entry and
 * on every dev reload — so a plain module map would be two different maps, and
 * every ticket would come back unknown.
 */
const store = globalThis as typeof globalThis & { __waTickets?: Map<string, Ticket> }
const tickets = (store.__waTickets ??= new Map<string, Ticket>())

/** Long enough to open a socket, short enough to be worthless if captured. */
const TTL = 60_000

function prune(now: number) {
  for (const [key, ticket] of tickets) {
    if (ticket.expires <= now) tickets.delete(key)
  }
}

export function issueTicket(userId: string): string {
  const now = Date.now()
  prune(now)
  const ticket = randomUUID()
  tickets.set(ticket, { userId, expires: now + TTL })
  return ticket
}

/** Returns the user id, and spends the ticket. Null if unknown or expired. */
export function redeemTicket(ticket: string): string | null {
  const found = tickets.get(ticket)
  if (!found) return null
  tickets.delete(ticket)
  return found.expires > Date.now() ? found.userId : null
}
