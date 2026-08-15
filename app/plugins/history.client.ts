import type { HistoryPayload } from '#shared/types/wire'

/**
 * Pulls the stored conversation back in on boot, so a reload picks up where
 * the thread left off instead of at the seed data.
 *
 * Deliberately not awaited: the UI renders on the seeds immediately and
 * history drops in when it arrives, so a slow — or absent — database never
 * holds up first paint. Rooms it discovers are picked up by the realtime
 * plugin's watcher, which subscribes them on the socket and on push.
 */
export default defineNuxtPlugin(() => {
  const store = useWhatsappStore()
  const { restore } = useIdentity()
  const me = restore()

  $fetch<HistoryPayload>('/api/history')
    .then(payload => store.hydrate(payload, me.id))
    .catch(error => console.warn('[history] load failed — starting from seeds', error))
})
