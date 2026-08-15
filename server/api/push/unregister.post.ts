interface Body {
  token?: string
}

/** Called when a browser revokes its token, e.g. notifications turned off. */
export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.token) {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }
  await unregisterToken(body.token)
  return { ok: true }
})
