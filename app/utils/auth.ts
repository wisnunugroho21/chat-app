/**
 * The message behind a failed `$fetch`.
 *
 * h3 puts `createError`'s `statusMessage` on the response body, which ofetch
 * hands back as `data`. Everything else — a dropped connection, a proxy error
 * page — has nothing useful in it, so the caller supplies the words.
 */
export function authMessage(cause: unknown, fallback: string): string {
  const error = cause as {
    statusMessage?: string
    data?: { statusMessage?: string, message?: string }
  } | null

  return (
    error?.data?.statusMessage
    || error?.statusMessage
    || error?.data?.message
    || fallback
  )
}
