/**
 * Trade the session cookie for a one-shot ticket the WebSocket can present.
 * POST because it mints something and spends server state, and because a GET
 * would be reachable from another origin's markup.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { ticket: issueTicket(user.id) }
})
