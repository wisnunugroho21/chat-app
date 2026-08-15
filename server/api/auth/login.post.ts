import { publicUser } from '~~/server/utils/users'

interface Body {
  username?: string
  password?: string
}

/**
 * A digest to check against when the account does not exist, so that a wrong
 * username costs the same time as a wrong password. Without it, whether a
 * handle is registered can be read straight off the clock.
 */
const ABSENT = { salt: 'decoy', hash: '00'.repeat(64) }

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const username = normaliseUsername(body?.username ?? '')
  const password = body?.password ?? ''

  const user = await findByUsername(username)
  const against = user ?? ABSENT
  const correct = await verifyPassword(password, against.salt, against.hash)

  // One message for both failures: which half was wrong is not the caller's
  // business, and saying so is how account lists get enumerated.
  if (!user || !correct) {
    throw createError({ statusCode: 401, statusMessage: 'Wrong username or password.' })
  }

  await startSession(event, user)
  return { user: publicUser(user) }
})
