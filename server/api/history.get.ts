import type { HistoryPayload } from '#shared/types/wire'

/**
 * The stored conversation, for a tab that has just booted.
 *
 * User-agnostic on purpose: the reply carries each message's sender, and the
 * browser decides which bubbles are its own by comparing ids. There is no auth
 * in this clone, so there is nothing here to scope it by anyway.
 */
export default defineEventHandler(async (): Promise<HistoryPayload> => loadHistory())
