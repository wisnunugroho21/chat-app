import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { UserDoc } from './mongo'

/**
 * The signed-in session.
 *
 * A sealed cookie, via h3's own session support: the payload is encrypted and
 * signed with `NUXT_SESSION_PASSWORD`, so the server keeps no session table
 * and a restart does not sign everybody out. Only the user id travels in it —
 * the account itself is read back from the store on every request, so a
 * renamed or deleted user cannot linger inside a cookie.
 */

interface SessionData {
  userId?: string
}

const COOKIE = 'wa-session'
const MAX_AGE = 60 * 60 * 24 * 30 // thirty days

let generated = ''

/**
 * Sealing needs at least 32 characters. Rather than ship a default secret —
 * which would be the same on every install, and so no secret at all — an
 * unset password becomes a random one for the life of the process.
 */
function password(): string {
  const configured = useRuntimeConfig().session?.password
  if (configured && configured.length >= 32) return configured

  if (!generated) {
    generated = randomBytes(32).toString('hex')
    console.warn(
      '[auth] NUXT_SESSION_PASSWORD is unset or shorter than 32 characters — '
      + 'using a random one, so every restart signs everybody out. '
      + 'Set it in .env to keep sessions.',
    )
  }
  return generated
}

const config = () => ({
  name: COOKIE,
  password: password(),
  maxAge: MAX_AGE,
  cookie: {
    // Lax still arrives on a normal navigation, and keeps the cookie off
    // cross-site requests.
    sameSite: 'lax' as const,
    secure: !import.meta.dev,
  },
})

export async function startSession(event: H3Event, user: UserDoc) {
  const session = await useSession<SessionData>(event, config())
  await session.update({ userId: user.id })
}

export async function endSession(event: H3Event) {
  const session = await useSession<SessionData>(event, config())
  await session.clear()
}

/** The signed-in account, or null. Never throws on a missing cookie. */
export async function sessionUser(event: H3Event): Promise<UserDoc | null> {
  const session = await useSession<SessionData>(event, config())
  const id = session.data.userId
  if (!id) return null
  return findById(id)
}

/** Same, but for endpoints that have nothing to say to a stranger. */
export async function requireUser(event: H3Event): Promise<UserDoc> {
  const user = await sessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  return user
}
