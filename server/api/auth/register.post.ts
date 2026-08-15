import { publicUser } from '~~/server/utils/users'

interface Body {
  username?: string
  name?: string
  password?: string
}

/** Handles are what you sign in with, so keep them boring and unambiguous. */
const USERNAME = /^[a-z0-9._-]{3,32}$/
const MIN_PASSWORD = 8

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)

  const username = normaliseUsername(body?.username ?? '')
  const name = (body?.name ?? '').trim()
  const password = body?.password ?? ''

  if (!USERNAME.test(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username must be 3–32 characters, using letters, numbers, dot, dash or underscore.',
    })
  }
  if (!name || name.length > 64) {
    throw createError({ statusCode: 400, statusMessage: 'Display name must be 1–64 characters.' })
  }
  if (password.length < MIN_PASSWORD) {
    throw createError({
      statusCode: 400,
      statusMessage: `Password must be at least ${MIN_PASSWORD} characters.`,
    })
  }

  const user = await createUser({ username, name, password })
  // Null means the handle is taken — including when two registrations race.
  if (!user) {
    throw createError({ statusCode: 409, statusMessage: 'That username is already taken.' })
  }

  await startSession(event, user)
  return { user: publicUser(user) }
})
