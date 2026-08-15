/**
 * Opens the database at boot rather than on the first message — index creation
 * and the initial handshake are then paid for before anyone is waiting on
 * them — and hands the pool back on shutdown so dev reloads do not pile up
 * connections.
 */
export default defineNitroPlugin((nitroApp) => {
  useChatDb()
  nitroApp.hooks.hook('close', () => closeChatDb())
})
