import type { WireUser } from '#shared/types/wire'

/**
 * Who this browser is on the wire.
 *
 * There is no auth here, so identity is a generated id. Two storages, on
 * purpose:
 *
 *   - `localStorage` holds the device identity, so a plain reload — or a new
 *     tab — is the same person coming back.
 *   - `?as=Name` mints a *separate* person and keeps it in `sessionStorage`,
 *     which is per-tab. That is what makes two tabs two people:
 *       http://localhost:3000/?as=Rina  and  http://localhost:3000/?as=Budi
 */
const KEY = 'wa:identity'

const me = ref<WireUser>({ id: '', name: '' })

function read(store: Storage): WireUser | null {
  try {
    const raw = store.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) as WireUser : null
    return parsed?.id && parsed?.name ? parsed : null
  }
  catch {
    return null
  }
}

function write(store: Storage, user: WireUser) {
  try {
    store.setItem(KEY, JSON.stringify(user))
  }
  catch {
    // Private mode: identity lasts as long as the tab, which still works.
  }
}

export function useIdentity() {
  /** Client-only: reads storage, so it must not run during SSR. */
  function restore(): WireUser {
    if (!import.meta.client) return me.value

    // An identity assumed earlier in this tab wins, so a reload with the
    // query string dropped does not turn Rina back into the device.
    const assumed = read(sessionStorage)
    if (assumed) {
      me.value = assumed
      return me.value
    }

    const asked = new URL(location.href).searchParams.get('as')?.trim()
    if (asked) {
      me.value = { id: newWireId(), name: asked.slice(0, 64) }
      write(sessionStorage, me.value)
      return me.value
    }

    const device = read(localStorage)
    me.value = device ?? { id: newWireId(), name: '' }
    if (!me.value.name) me.value.name = `Device ${me.value.id.slice(0, 4).toUpperCase()}`
    write(localStorage, me.value)
    return me.value
  }

  function rename(name: string) {
    const trimmed = name.trim()
    if (!trimmed || !import.meta.client) return
    me.value = { ...me.value, name: trimmed.slice(0, 64) }
    // Rename wherever this identity came from.
    write(read(sessionStorage) ? sessionStorage : localStorage, me.value)
  }

  return { me, restore, rename }
}
