/**
 * The gate. Runs on the server render too, so a signed-out visitor is sent to
 * the login page before any chat markup is produced rather than after a flash
 * of it.
 */
const PUBLIC = new Set(['/login', '/register'])

export default defineNuxtRouteMiddleware(async (to) => {
  const { signedIn, fetchMe } = useAuth()

  // One lookup per session; `useState` carries the answer from the server
  // render into the browser, so this does not refetch on hydration.
  await fetchMe()

  if (!signedIn.value && !PUBLIC.has(to.path)) {
    // Remember where they were headed, so signing in resumes it.
    const next = to.fullPath === '/' ? undefined : to.fullPath
    return navigateTo({ path: '/login', query: next ? { next } : undefined })
  }

  // Already signed in: the login and register pages have nothing to offer.
  if (signedIn.value && PUBLIC.has(to.path)) return navigateTo('/')
})
