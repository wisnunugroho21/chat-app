interface Body {
  token?: string
  rooms?: string[]
}

/**
 * A browser hands over the FCM token it just minted, plus what it listens to.
 * Whose token it is comes from the session, not the body — a token registered
 * against somebody else's identity would send them your notifications.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<Body>(event)

  if (!body?.token || typeof body.token !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }

  const rooms = Array.isArray(body.rooms)
    ? body.rooms.filter(r => typeof r === 'string' && r).slice(0, 200)
    : []

  await registerToken(body.token, { id: user.id, name: user.name }, rooms)

  return { ok: true, rooms: rooms.length }
})
