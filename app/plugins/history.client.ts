import type { HistoryPayload } from '#shared/types/wire'

/**
 * Pulls the stored conversation back in, so a reload picks up where the thread
 * left off instead of at the seed data.
 *
 * Waits for a signed-in account, because the history endpoint has nothing to
 * say to anyone else — and because whose bubbles are whose is decided by
 * comparing senders against that account. Loading is deliberately not awaited:
 * the UI renders on the seeds immediately and history drops in when it
 * arrives, so a slow — or absent — database never holds up first paint.
 */
export default defineNuxtPlugin(() => {
  const store = useWhatsappStore()
  const { user } = useAuth()

  let loadedFor = ''

  watch(
    () => user.value?.id,
    (id) => {
      if (!id || id === loadedFor) return
      loadedFor = id
      $fetch<HistoryPayload>('/api/history')
        .then(payload => store.hydrate(payload, id))
        .catch(error => console.warn('[history] load failed — starting from seeds', error))
    },
    { immediate: true },
  )
})
