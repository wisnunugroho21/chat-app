import type { HistoryPayload, ReceiptStatus, StoredMessage, WireUser } from '#shared/types/wire'
import type { MessageDoc, StoredStatus } from './mongo'

/**
 * Chats and messages, on disk.
 *
 * Every write here is best-effort: the socket has already delivered the frame
 * by the time we are called, so a database that is down or absent must cost
 * the conversation nothing. Failures are logged and swallowed, and with no
 * Mongo configured every function is a no-op that reads back as empty history.
 */

/** How many rooms a booting tab is given, newest activity first. */
const ROOM_LIMIT = 50
/** And how many messages of each. */
const MESSAGE_LIMIT = 200

/** Persist one message and fold it into its room's summary. */
export async function saveMessage(msg: {
  room: string
  from: WireUser
  wireId: string
  text: string
  time: string
}): Promise<void> {
  try {
    const db = await chatCollections()
    if (!db) return

    const now = new Date()
    await Promise.all([
      // `wireId` is unique, so a message the client retried after a reconnect
      // updates nothing rather than landing twice.
      db.messages.updateOne(
        { wireId: msg.wireId },
        {
          $setOnInsert: {
            wireId: msg.wireId,
            room: msg.room,
            from: msg.from,
            text: msg.text,
            time: msg.time,
            status: 'sent',
            createdAt: now,
          },
        },
        { upsert: true },
      ),
      db.rooms.updateOne(
        { name: msg.room },
        {
          $set: {
            lastText: msg.text,
            lastFrom: msg.from.name,
            lastTime: msg.time,
            updatedAt: now,
          },
          $addToSet: { participants: msg.from.name },
          $setOnInsert: { name: msg.room, createdAt: now },
        },
        { upsert: true },
      ),
    ])
  }
  catch (error) {
    console.error('[mongo] saveMessage failed', error)
  }
}

/**
 * Record a receipt. Status only ever climbs — a `delivered` arriving late from
 * a second device cannot un-read a message.
 */
export async function saveReceipts(
  room: string,
  wireIds: string[],
  status: ReceiptStatus,
): Promise<void> {
  if (!wireIds.length) return
  try {
    const db = await chatCollections()
    if (!db) return

    const beatable: StoredStatus[] = status === 'read' ? ['sent', 'delivered'] : ['sent']
    await db.messages.updateMany(
      { room, wireId: { $in: wireIds }, status: { $in: beatable } },
      { $set: { status } },
    )
  }
  catch (error) {
    console.error('[mongo] saveReceipts failed', error)
  }
}

/**
 * Everything a booting tab needs to rebuild its threads: the most recently
 * active rooms, and the tail of each one's conversation.
 */
export async function loadHistory(): Promise<HistoryPayload> {
  const empty: HistoryPayload = { persisted: false, rooms: [], messages: {} }
  try {
    const db = await chatCollections()
    if (!db) return empty

    const rooms = await db.rooms
      .find({}, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .limit(ROOM_LIMIT)
      .toArray()

    if (!rooms.length) return { ...empty, persisted: true }

    // One pass over the rooms' messages, sliced to the last N of each — a
    // find-per-room would be a query per conversation on every page load.
    const grouped = await db.messages
      .aggregate<{ _id: string, messages: MessageDoc[] }>([
        { $match: { room: { $in: rooms.map(r => r.name) } } },
        { $sort: { createdAt: 1, _id: 1 } },
        { $group: { _id: '$room', messages: { $push: '$$ROOT' } } },
        { $project: { messages: { $slice: ['$messages', -MESSAGE_LIMIT] } } },
      ])
      .toArray()

    const messages: Record<string, StoredMessage[]> = {}
    for (const group of grouped) {
      messages[group._id] = group.messages.map(m => ({
        wireId: m.wireId,
        from: m.from,
        text: m.text,
        time: m.time,
        status: m.status,
      }))
    }

    return {
      persisted: true,
      rooms: rooms.map(r => ({
        name: r.name,
        participants: r.participants ?? [],
        lastText: r.lastText ?? '',
        lastFrom: r.lastFrom ?? '',
        lastTime: r.lastTime ?? '',
      })),
      messages,
    }
  }
  catch (error) {
    console.error('[mongo] loadHistory failed', error)
    return empty
  }
}
