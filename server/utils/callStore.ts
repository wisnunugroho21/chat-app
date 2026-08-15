import { callOutcome } from '#shared/types/wire'
import type { CallSignal, WireUser } from '#shared/types/wire'

/**
 * Call logs, written from the signalling that already passes through here.
 *
 * The server is the single writer on purpose. Both ends log a call locally
 * when it ends, but only one `end` frame is ever sent — the side that hangs up
 * emits it, and the side that receives it stays quiet — so recording it here
 * gives exactly one record per call, and both browsers read the same one back.
 *
 * A call in progress is held in memory, the same way presence is: it exists
 * for the seconds between `invite` and `end`, and losing it on a restart costs
 * one log entry, not a conversation.
 */

interface LiveCall {
  room: string
  /** Who placed it. */
  from: WireUser
  kind: 'voice' | 'video'
  startedAt: Date
  answeredAt?: Date
}

const live = new Map<string, LiveCall>()

/** A call nobody ever ended. Cleared so a long-lived process cannot grow. */
const STALE_AFTER = 60 * 60 * 1000

function prune(now: number) {
  for (const [callId, call] of live) {
    if (now - call.startedAt.getTime() > STALE_AFTER) live.delete(callId)
  }
}

/**
 * Follow one signalling frame. Only `invite`, `accept` and `end` say anything
 * about how a call went; the rest is media negotiation and passes straight
 * through.
 */
export async function recordCallSignal(room: string, from: WireUser, signal: CallSignal) {
  try {
    switch (signal.s) {
      case 'invite': {
        prune(Date.now())
        live.set(signal.callId, { room, from, kind: signal.kind, startedAt: new Date() })
        break
      }

      case 'accept': {
        const call = live.get(signal.callId)
        // The first answer wins; a second device arriving late does not
        // restart the clock.
        if (call && !call.answeredAt) call.answeredAt = new Date()
        break
      }

      case 'end': {
        // Not the end of the call — it is the caller telling one losing device
        // that somebody else picked up. The call itself is still running.
        if (signal.reason === 'answered-elsewhere') break

        const call = live.get(signal.callId)
        if (!call) break // already recorded, or from before a restart
        live.delete(signal.callId)

        const endedAt = new Date()
        const connected = !!call.answeredAt
        // Prefer the hanging-up side's own clock: it starts when media
        // actually flows, which is later than the answer by however long ICE
        // took to settle.
        const secs = connected
          ? Math.max(0, Math.round(signal.secs ?? (endedAt.getTime() - call.answeredAt!.getTime()) / 1000))
          : 0

        await saveCall({
          callId: signal.callId,
          room: call.room,
          from: call.from,
          kind: call.kind,
          outcome: callOutcome(signal.reason, connected),
          secs,
          startedAt: call.startedAt,
          endedAt,
        })
        break
      }
    }
  }
  catch (error) {
    console.error('[mongo] recordCallSignal failed', error)
  }
}
