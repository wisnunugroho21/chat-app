import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'
import type { WireUser } from '#shared/types/wire'
import type { UserDoc } from './mongo'

/**
 * Accounts, and the password handling around them.
 *
 * Hashing is scrypt from `node:crypto` — deliberately, so that adding
 * authentication adds no dependency: it is memory-hard, it is in the standard
 * library, and it needs no native build step. Passwords are never stored, and
 * never leave this module in any other form.
 *
 * Mongo holds the accounts when it is configured; the in-memory map is the
 * same fallback the other stores keep, so a fresh clone can still register and
 * sign in — it just forgets everyone on restart.
 */

const KEY_LENGTH = 64
/** Cost parameters. N must be a power of two; 2^15 is ~100ms on a laptop.
 *  `maxmem` has to be raised to match, or node refuses at this cost. */
const SCRYPT: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 }

/** On `globalThis` for the reason `tickets.ts` explains: registering happens
 *  in one entry point and the socket reads accounts from another. */
const store = globalThis as typeof globalThis & { __waUsers?: Map<string, UserDoc> }
const memory = (store.__waUsers ??= new Map<string, UserDoc>())

/** What the rest of the app is allowed to see: never the salt or the hash. */
export interface PublicUser extends WireUser {
  username: string
}

export const publicUser = (user: UserDoc): PublicUser => ({
  id: user.id,
  name: user.name,
  username: user.username,
})

/** `promisify` resolves to scrypt's three-argument overload, which cannot
 *  carry the cost parameters — so the callback is wrapped by hand. */
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await derive(password, salt)).toString('hex')
  return { salt, hash }
}

/** Constant-time, so a wrong password cannot be found one byte at a time. */
export async function verifyPassword(password: string, salt: string, hash: string) {
  const expected = Buffer.from(hash, 'hex')
  const actual = await derive(password, salt)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export const normaliseUsername = (raw: string) => raw.trim().toLowerCase()

export async function findByUsername(username: string): Promise<UserDoc | null> {
  const key = normaliseUsername(username)
  const db = await chatCollections()
  if (db) return db.users.findOne({ username: key })
  return memory.get(key) ?? null
}

export async function findById(id: string): Promise<UserDoc | null> {
  const db = await chatCollections()
  if (db) return db.users.findOne({ id })
  for (const user of memory.values()) {
    if (user.id === id) return user
  }
  return null
}

/**
 * Create an account. Returns null when the handle is taken — including when
 * two registrations race, which the unique index turns into a duplicate-key
 * error rather than a second account.
 */
export async function createUser(input: {
  username: string
  name: string
  password: string
}): Promise<UserDoc | null> {
  const username = normaliseUsername(input.username)
  const { salt, hash } = await hashPassword(input.password)
  const user: UserDoc = {
    id: randomUUID(),
    username,
    name: input.name.trim(),
    salt,
    hash,
    createdAt: new Date(),
  }

  const db = await chatCollections()
  if (!db) {
    if (memory.has(username)) return null
    memory.set(username, user)
    return user
  }

  try {
    await db.users.insertOne(user)
    return user
  }
  catch (error) {
    // 11000 is Mongo's duplicate key; anything else is a real failure.
    if ((error as { code?: number }).code === 11000) return null
    throw error
  }
}
