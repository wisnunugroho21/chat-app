import type { WireUser } from '#shared/types/wire'

/**
 * Who this browser is on the wire.
 *
 * There used to be no accounts here, so identity was a generated id and a
 * `?as=Name` query string. Both are gone: the signed-in account *is* the
 * identity now, and the server decides it — the socket proves who it belongs
 * to with a ticket rather than taking the browser's word for it.
 *
 * This stays as the seam the store and the transports read, so nothing else
 * had to learn where identity comes from.
 */
export function useIdentity() {
  const { user } = useAuth()

  const me = computed<WireUser>(() =>
    user.value ? { id: user.value.id, name: user.value.name } : { id: '', name: '' },
  )

  return { me }
}
