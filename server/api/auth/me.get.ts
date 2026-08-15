import { publicUser } from '~~/server/utils/users'

/** Who the cookie says you are. `null` rather than a 401: not being signed in
 *  is a normal answer to this question, and the boot path asks it every time. */
export default defineEventHandler(async (event) => {
  const user = await sessionUser(event)
  return { user: user ? publicUser(user) : null }
})
