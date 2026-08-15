/**
 * The realtime protocol, shared by the browser and the Nitro socket route.
 *
 * A "room" is a conversation, addressed by its chat name — the same key the
 * chat list and the thread store already use. `wireId` is the globally unique
 * id of one message; receipts reference it, and only the client that sent a
 * message holds it as an outgoing bubble, so a receipt can be broadcast to a
 * whole room and still land on exactly one bubble.
 */

export interface WireUser {
  id: string
  name: string
}

export type ReceiptStatus = 'delivered' | 'read'

export type CallKind = 'voice' | 'video'

/* -------------------------------------------------------------------------
 * WebRTC signalling.
 *
 * The socket carries the handshake; the media never touches the server. One
 * `callId` runs from invite to hangup, so a frame from a call that has already
 * been torn down can be recognised and dropped.
 *
 * An `invite` goes to the whole room — every device in the conversation rings,
 * as a phone does. Everything after it is addressed to one user, because a
 * peer connection has exactly two ends: the caller learns who picked up from
 * the `accept`, and talks only to them from then on.
 * ---------------------------------------------------------------------- */

/** Structural copy of `RTCIceCandidateInit`: the server has no DOM types. */
export interface IceCandidateWire {
  candidate: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type CallEndReason =
  | 'hangup'
  | 'declined'
  | 'no-answer'
  | 'busy'
  | 'failed'
  /** Another of your devices got there first. */
  | 'answered-elsewhere'

export type CallSignal =
  /** Ring the room, carrying the offer so answering needs one round trip. */
  | { s: 'invite', callId: string, kind: CallKind, sdp: string }
  /** "Their phone is ringing" — turns the caller's status line over. */
  | { s: 'ring', callId: string }
  | { s: 'accept', callId: string, sdp: string }
  /** Renegotiation, for a camera switched on mid-call. */
  | { s: 'offer', callId: string, sdp: string }
  | { s: 'answer', callId: string, sdp: string }
  | { s: 'ice', callId: string, candidate: IceCandidateWire }
  /** Camera on or off, so the far end knows to show the avatar instead. */
  | { s: 'media', callId: string, cam: boolean }
  /** `secs` is the hanging-up side's own clock — the only honest measure of
   *  how long the call lasted, and what the log is written from. */
  | { s: 'end', callId: string, reason: CallEndReason, secs?: number }

export type ClientMessage =
  /**
   * First frame on every connection. The identity is not claimed here — it is
   * proved: `ticket` is a one-shot token the browser got from an authenticated
   * request, and the server resolves the account behind it.
   */
  | { t: 'hello', ticket: string, rooms: string[] }
  | { t: 'join', rooms: string[] }
  | { t: 'msg', room: string, wireId: string, text: string, time: string }
  | { t: 'typing', room: string, on: boolean }
  | { t: 'receipt', room: string, wireIds: string[], status: ReceiptStatus }
  /** `to` addresses one user; without it the whole room hears it. */
  | { t: 'call', room: string, to?: string, signal: CallSignal }

export type ServerMessage =
  | { t: 'ready', user: WireUser, rooms: string[] }
  | { t: 'msg', room: string, from: WireUser, wireId: string, text: string, time: string }
  | { t: 'typing', room: string, from: WireUser, on: boolean }
  | { t: 'receipt', room: string, wireIds: string[], status: ReceiptStatus }
  | { t: 'call', room: string, from: WireUser, signal: CallSignal }
  | { t: 'error', message: string }

/**
 * Payload carried by an FCM push so the click can open the right chat.
 *
 * `fromId` is the sender's identity, not their name: a foreground push is
 * folded into the thread like any other message, and that needs the same id
 * the socket would have carried, to tell whose bubble it is.
 */
export interface PushData {
  room: string
  from: string
  fromId: string
  wireId: string
}

/* -------------------------------------------------------------------------
 * Stored history — what `GET /api/history` hands a booting tab so a reload
 * comes back to the conversation instead of the seed data. Same shapes the
 * socket uses, with the delivery state the server has recorded since.
 * ---------------------------------------------------------------------- */

export interface StoredMessage {
  wireId: string
  from: WireUser
  text: string
  time: string
  status: 'sent' | ReceiptStatus
}

/**
 * How a call finished. The record keeps the fact, not the wording: the same
 * unanswered call reads "Unanswered" to whoever placed it and "Missed" to
 * whoever did not, so the sentence is composed per reader.
 */
export type CallOutcome =
  | 'answered'
  | 'missed'
  | 'declined'
  | 'cancelled'
  | 'busy'
  | 'failed'

/** The client and the server must agree on this, so it lives with the wire. */
export function callOutcome(reason: CallEndReason, connected: boolean): CallOutcome {
  if (connected) return 'answered'
  if (reason === 'declined') return 'declined'
  if (reason === 'no-answer') return 'missed'
  if (reason === 'busy') return 'busy'
  if (reason === 'failed') return 'failed'
  return 'cancelled'
}

export interface StoredCall {
  callId: string
  /** Who placed it — which is how a reader knows if it was theirs. */
  from: WireUser
  kind: CallKind
  outcome: CallOutcome
  secs: number
  /** When it ended, ISO. Formatted to a clock label by the reader's browser. */
  at: string
}

/**
 * One row of a stored conversation. Messages and calls are interleaved by the
 * server, which is the side holding the timestamps to interleave them by.
 */
export type StoredEntry =
  | ({ type: 'msg' } & StoredMessage)
  | ({ type: 'call' } & StoredCall)

export interface StoredRoom {
  name: string
  /** Display names seen sending here; captions a group's sub-line. */
  participants: string[]
  lastText: string
  lastFrom: string
  lastTime: string
}

export interface HistoryPayload {
  /** False when no database is configured — the response is then empty. */
  persisted: boolean
  rooms: StoredRoom[]
  /** Oldest first, keyed by room. */
  entries: Record<string, StoredEntry[]>
}
