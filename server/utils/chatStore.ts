import type { HistoryPayload, ReceiptStatus, StoredEntry, WireUser } from '#shared/types/wire'
import type { CallDoc, MessageDoc, StoredStatus } from './mongo'

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
/** Calls are far rarer than messages, so they need far less room. */
const CALL_LIMIT = 50

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
 * Persist one finished call, and let its room float up the chat list with it.
 * A room that has only ever carried calls gets created here.
 */
export async function saveCall(call: CallDoc): Promise<void> {
  const db = await chatCollections()
  if (!db) return

  await Promise.all([
    db.calls.updateOne({ callId: call.callId }, { $setOnInsert: call }, { upsert: true }),
    db.rooms.updateOne(
      { name: call.room },
      {
        $set: { updatedAt: call.endedAt },
        $addToSet: { participants: call.from.name },
        $setOnInsert: { name: call.room, createdAt: call.endedAt },
      },
      { upsert: true },
    ),
  ])
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
  const empty: HistoryPayload = { persisted: false, rooms: [], entries: {} }
  try {
    const db = await chatCollections()
    if (!db) return empty

    const rooms = await db.rooms
      .find({}, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .limit(ROOM_LIMIT)
      .toArray()

    if (!rooms.length) return { ...empty, persisted: true }
    const names = rooms.map(r => r.name)

    // One pass per collection, sliced to the last N of each room — a
    // find-per-room would be a query per conversation on every page load.
    const [messages, calls] = await Promise.all([
      db.messages
        .aggregate<{ _id: string, rows: MessageDoc[] }>([
          { $match: { room: { $in: names } } },
          { $sort: { createdAt: 1, _id: 1 } },
          { $group: { _id: '$room', rows: { $push: '$$ROOT' } } },
          { $project: { rows: { $slice: ['$rows', -MESSAGE_LIMIT] } } },
        ])
        .toArray(),
      db.calls
        .aggregate<{ _id: string, rows: CallDoc[] }>([
          { $match: { room: { $in: names } } },
          { $sort: { endedAt: 1, _id: 1 } },
          { $group: { _id: '$room', rows: { $push: '$$ROOT' } } },
          { $project: { rows: { $slice: ['$rows', -CALL_LIMIT] } } },
        ])
        .toArray(),
    ])

    // Interleaved here rather than in the browser: this is the side holding
    // the timestamps to interleave them by.
    const dated = new Map<string, { at: number, entry: StoredEntry }[]>()
    const push = (room: string, at: Date, entry: StoredEntry) => {
      const rows = dated.get(room) ?? []
      rows.push({ at: at.getTime(), entry })
      dated.set(room, rows)
    }

    for (const group of messages) {
      for (const m of group.rows) {
        push(group._id, m.createdAt, {
          type: 'msg',
          wireId: m.wireId,
          from: m.from,
          text: m.text,
          time: m.time,
          status: m.status,
        })
      }
    }

    for (const group of calls) {
      for (const c of group.rows) {
        push(group._id, c.endedAt, {
          type: 'call',
          callId: c.callId,
          from: c.from,
          kind: c.kind,
          outcome: c.outcome,
          secs: c.secs,
          at: c.endedAt.toISOString(),
        })
      }
    }

    const entries: Record<string, StoredEntry[]> = {}
    for (const [room, rows] of dated) {
      entries[room] = rows.sort((a, b) => a.at - b.at).map(row => row.entry)
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
      entries,
    }
  }
  catch (error) {
    console.error('[mongo] loadHistory failed', error)
    return empty
  }
}
