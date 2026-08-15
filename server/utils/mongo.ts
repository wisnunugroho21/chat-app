import { MongoClient } from 'mongodb'
import type { Collection, Db } from 'mongodb'
import type { ReceiptStatus, WireUser } from '#shared/types/wire'

/**
 * The MongoDB connection, shared by everything on the server that stores
 * something.
 *
 * Optional, in the same way FCM is: with no `NUXT_MONGODB_URI` in the
 * environment every store falls back to memory, so `pnpm dev` on a fresh clone
 * still runs — it just forgets everything on restart. A connection that fails
 * (Mongo down, wrong URI) degrades the same way rather than taking message
 * delivery with it.
 *
 * The handle is cached on `globalThis` because Nitro re-evaluates server
 * modules on every dev reload; without it each edit would open a new pool.
 */

export type StoredStatus = 'sent' | ReceiptStatus

/** One message, exactly as it crossed the wire, plus its delivery state. */
export interface MessageDoc {
  wireId: string
  room: string
  from: WireUser
  text: string
  /** The clock label the sender painted on the bubble, e.g. "14:12". */
  time: string
  status: StoredStatus
  createdAt: Date
}

/** One conversation. Rebuilt from the messages that pass through it. */
export interface RoomDoc {
  name: string
  /** Display names seen sending here — enough to caption a group. */
  participants: string[]
  lastText: string
  lastFrom: string
  lastTime: string
  createdAt: Date
  updatedAt: Date
}

/** An FCM registration token and what it listens to. */
export interface TokenDoc {
  token: string
  user: WireUser
  rooms: string[]
  seen: Date
}

export interface ChatCollections {
  messages: Collection<MessageDoc>
  rooms: Collection<RoomDoc>
  tokens: Collection<TokenDoc>
}

/** How long to sit out before dialling a Mongo that just refused us. */
const RETRY_AFTER = 10_000

const cache = globalThis as typeof globalThis & {
  __chatDb?: Promise<Db | null> | null
  __chatClient?: MongoClient | null
  __chatDbFailedAt?: number
}

let warned = false

async function connect(): Promise<Db | null> {
  const { mongodb } = useRuntimeConfig()

  if (!mongodb?.uri) {
    if (!warned) {
      warned = true
      console.info(
        '[mongo] no NUXT_MONGODB_URI — running on memory, history is lost on restart. '
        + 'Set it to persist chats, messages and push tokens.',
      )
    }
    return null
  }

  // Fail fast: a wrong host should degrade in seconds, not hang the socket
  // handler for the driver's 30s default.
  const client = new MongoClient(mongodb.uri, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  const db = client.db(mongodb.db || undefined)
  await ensureIndexes(db)
  cache.__chatClient = client
  console.info(`[mongo] connected to ${db.databaseName}`)
  return db
}

/**
 * Indexes are created once per process start. `wireId` unique is the one that
 * matters: it makes a replayed message a no-op instead of a duplicate row.
 */
async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection<MessageDoc>('messages').createIndex({ wireId: 1 }, { unique: true }),
    db.collection<MessageDoc>('messages').createIndex({ room: 1, createdAt: 1 }),
    db.collection<RoomDoc>('rooms').createIndex({ name: 1 }, { unique: true }),
    db.collection<RoomDoc>('rooms').createIndex({ updatedAt: -1 }),
    db.collection<TokenDoc>('tokens').createIndex({ token: 1 }, { unique: true }),
    db.collection<TokenDoc>('tokens').createIndex({ rooms: 1 }),
  ])
}

/** The database, or `null` when there is not one to talk to. Never throws. */
export function useChatDb(): Promise<Db | null> {
  if (cache.__chatDb) return cache.__chatDb

  const failedAt = cache.__chatDbFailedAt ?? 0
  if (failedAt && Date.now() - failedAt < RETRY_AFTER) return Promise.resolve(null)

  cache.__chatDb = connect().catch((error) => {
    console.error('[mongo] connection failed — falling back to memory', error)
    cache.__chatDb = null
    cache.__chatDbFailedAt = Date.now()
    return null
  })
  return cache.__chatDb
}

/** The three collections, or `null` when Mongo is off. */
export async function chatCollections(): Promise<ChatCollections | null> {
  const db = await useChatDb()
  if (!db) return null
  return {
    messages: db.collection<MessageDoc>('messages'),
    rooms: db.collection<RoomDoc>('rooms'),
    tokens: db.collection<TokenDoc>('tokens'),
  }
}

export async function closeChatDb() {
  const client = cache.__chatClient
  cache.__chatDb = null
  cache.__chatClient = null
  await client?.close().catch(() => {})
}
