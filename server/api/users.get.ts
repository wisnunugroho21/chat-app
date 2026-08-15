import { listUsers, publicUser } from '~~/server/utils/users'

/**
 * The people you can start a conversation with: everyone who has registered,
 * minus yourself. This is what replaced the hardcoded contact list.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const users = await listUsers(me.id)
  return { users: users.map(publicUser) }
})
