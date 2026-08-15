import type { WireUser } from '#shared/types/wire'

interface Body {
  token?: string
  user?: WireUser
  rooms?: string[]
}

/** A browser hands over the FCM token it just minted, plus what it listens to. */
export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)

  if (!body?.token || typeof body.token !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }
  if (!body.user?.id || !body.user?.name) {
    throw createError({ statusCode: 400, statusMessage: 'user is required' })
  }

  const rooms = Array.isArray(body.rooms)
    ? body.rooms.filter(r => typeof r === 'string' && r).slice(0, 200)
    : []

  registerToken(body.token, { id: body.user.id, name: body.user.name }, rooms)

  return { ok: true, rooms: rooms.length }
})
