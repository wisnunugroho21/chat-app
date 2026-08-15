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

export type ClientMessage =
  /** First frame on every connection: who I am and what I am listening to. */
  | { t: 'hello', user: WireUser, rooms: string[] }
  | { t: 'join', rooms: string[] }
  | { t: 'msg', room: string, wireId: string, text: string, time: string }
  | { t: 'typing', room: string, on: boolean }
  | { t: 'receipt', room: string, wireIds: string[], status: ReceiptStatus }

export type ServerMessage =
  | { t: 'ready', user: WireUser, rooms: string[] }
  | { t: 'msg', room: string, from: WireUser, wireId: string, text: string, time: string }
  | { t: 'typing', room: string, from: WireUser, on: boolean }
  | { t: 'receipt', room: string, wireIds: string[], status: ReceiptStatus }
  | { t: 'error', message: string }

/** Payload carried by an FCM push so the click can open the right chat. */
export interface PushData {
  room: string
  from: string
  wireId: string
}
