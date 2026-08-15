import type { WireUser } from '#shared/types/wire'

/**
 * Who is signed in.
 *
 * The session lives in an HTTP-only cookie, so there is nothing here to read
 * it out of — the account is fetched once at boot and kept in `useState`,
 * which carries it across the server render into the browser without a second
 * request.
 */
export interface AuthUser extends WireUser {
  username: string
}

interface AuthReply {
  user: AuthUser | null
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  /** Distinguishes "nobody is signed in" from "we have not looked yet". */
  const resolved = useState<boolean>('auth:resolved', () => false)

  const signedIn = computed(() => !!user.value)

  /**
   * `useRequestFetch` rather than plain `$fetch`: during the server render
   * the cookie is on the incoming request, and this is what forwards it.
   */
  async function fetchMe(force = false): Promise<AuthUser | null> {
    if (resolved.value && !force) return user.value
    try {
      const reply = await useRequestFetch()<AuthReply>('/api/auth/me')
      user.value = reply.user
    }
    catch {
      // A failed lookup is not a signed-in one.
      user.value = null
    }
    resolved.value = true
    return user.value
  }

  async function login(username: string, password: string): Promise<AuthUser> {
    const reply = await $fetch<AuthReply>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    user.value = reply.user
    resolved.value = true
    return reply.user!
  }

  async function register(input: {
    username: string
    name: string
    password: string
  }): Promise<AuthUser> {
    const reply = await $fetch<AuthReply>('/api/auth/register', {
      method: 'POST',
      body: input,
    })
    user.value = reply.user
    resolved.value = true
    return reply.user!
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    user.value = null
    resolved.value = true
  }

  return { user, signedIn, resolved, fetchMe, login, register, logout }
}
