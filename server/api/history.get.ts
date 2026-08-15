import type { HistoryPayload } from '#shared/types/wire'

/**
 * The stored conversation, for a tab that has just booted.
 *
 * User-agnostic on purpose: the reply carries each message's sender, and the
 * browser decides which bubbles are its own by comparing ids. There is no auth
 * in this clone, so there is nothing here to scope it by anyway.
 */
export default defineEventHandler(async (event): Promise<HistoryPayload> => {
  // Stored conversations are not for passers-by. Still unscoped beyond this —
  // every signed-in account sees every room — but that is the room model's
  // doing, not an accident of this endpoint.
  await requireUser(event)
  return loadHistory()
})
