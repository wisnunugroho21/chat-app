import { CONTACTS } from '~/data/contacts'
import type { Call, CallFace, CallKind } from '~/types/whatsapp'
import type { CallEndReason, CallSignal, IceCandidateWire, ServerMessage } from '#shared/types/wire'

/**
 * Calls: the screen, and the WebRTC session behind it.
 *
 * The media is peer to peer — `usePeerConnection` owns that. What lives here
 * is the negotiation as the UI experiences it: ringing, picking up, hanging
 * up, and the handful of frames that have to cross the socket for two
 * browsers to find each other.
 *
 * How a call reaches the network is installed from outside, the same way the
 * chat store gets its transport, so nothing here imports the socket.
 */
export interface CallTransport {
  sendCall: (room: string, signal: CallSignal, to?: string) => void
}

const transport = shallowRef<CallTransport | null>(null)

export const installCallTransport = (t: CallTransport | null) => (transport.value = t)

// A call only ever exists on the client, so module scope is safe here.
const call = ref<Call | null>(null)
/** The call that just ended, held only until its screen has faded out. */
const ended = ref<Call | null>(null)
const status = ref('Calling…')
const overlayOpen = ref(false)
const toastOpen = ref(false)

let seq = 0 // increments per call, so stale timers can tell
let ticker: ReturnType<typeof setInterval> | null = null
let stage: ReturnType<typeof setTimeout>[] = [] // timeouts belonging to a call

/** The live session's signalling state. Reset by `forget`. */
let callId = ''
/** The far end. Empty until somebody picks up — an invite has no addressee. */
let peerId = ''
/** The offer that came in with an invite, held while the phone rings. */
let heldOffer: string | null = null
/** Candidates found before we knew who to send them to. */
let earlyIce: CallSignal[] = []

/** Long enough to walk to the phone, short enough not to ring forever. */
const RING_TIMEOUT = 30_000

const at = (fn: () => void, ms: number) => stage.push(setTimeout(fn, ms))
const clearStage = () => {
  stage.forEach(clearTimeout)
  stage = []
}

function forget() {
  callId = ''
  peerId = ''
  heldOffer = null
  earlyIce = []
}

export function useCallCenter() {
  const store = useWhatsappStore()
  const { announce } = useWhatsappOverlays()
  const { motionMs } = useWhatsappLayout()
  const peer = usePeerConnection()

  /** Avatar colour + initials for whoever is on the other end. */
  function faceOf(name: string): CallFace {
    const chat = store.chatByName(name)
    if (chat) return { av: chat.av, initials: faceInitials(chat) }
    const contact = CONTACTS.find(c => c.name === name)
    return { av: contact ? contact.av : 'a1', initials: initials(name) }
  }

  /** What the call screens paint. Outlives `call` through the closing fade,
   *  so a hung-up call does not blank its own name on the way out. */
  const screen = computed(() => call.value ?? ended.value)

  const flags = computed(() => {
    const live = screen.value
    if (!live) return ''
    const out: string[] = []
    if (live.muted) out.push('Muted')
    if (live.kind === 'video' && !live.cam) out.push('Camera off')
    if (live.speaker) out.push('Speaker')
    return out.join(' · ')
  })

  /** Their camera is on and its pictures have arrived. */
  const remoteVideo = computed(() =>
    !!call.value?.remoteCam && peer.hasVideo(peer.remoteStream.value),
  )

  /* ---------- Signalling ---------- */

  function emit(signal: CallSignal, to = peerId) {
    const live = call.value ?? ended.value
    if (!live || live.simulated) return
    transport.value?.sendCall(live.room, signal, to || undefined)
  }

  /** Candidates are useless to a room; they wait for an addressee. */
  function emitIce(signal: CallSignal) {
    if (!peerId) {
      earlyIce.push(signal)
      return
    }
    emit(signal)
  }

  function flushIce() {
    const queued = earlyIce
    earlyIce = []
    for (const signal of queued) emit(signal)
  }

  const hooks: PeerHooks = {
    onIce: (candidate: IceCandidateWire) => emitIce({ s: 'ice', callId, candidate }),
    onConnected: () => {
      if (call.value) connect(call.value)
    },
    onFailed: () => endCall('failed'),
  }

  function connect(live: Call) {
    if (live.connected) return // ICE can report 'connected' more than once
    clearStage()
    live.connected = true
    live.secs = 0
    status.value = callDuration(0)
    if (ticker) clearInterval(ticker)
    // Closes over its own call, so a stale interval can never mutate
    // whichever call happens to be live later.
    ticker = setInterval(() => {
      live.secs++
      status.value = callDuration(live.secs)
    }, 1000)
  }

  /** Media was refused, or the negotiation broke before it began. Ends the
   *  call first, then says why — the reason should outlast the teardown. */
  function failCall(message: string) {
    endCall('failed')
    status.value = message
    announce(message)
  }

  /* ---------- Outgoing ---------- */

  async function startCall(kind: CallKind) {
    if (call.value) return // one line at a time
    clearStage() // drop anything still pending from the last call
    ended.value = null
    seq++
    forget()
    callId = newWireId()

    const name = store.current.value
    call.value = {
      name,
      room: name,
      face: faceOf(name),
      kind,
      direction: 'out',
      secs: 0,
      muted: false,
      cam: kind === 'video',
      remoteCam: kind === 'video',
      speaker: false,
      answered: true,
      connected: false,
    }
    status.value = 'Calling…'
    overlayOpen.value = true

    const mine = seq
    try {
      // The caller is impolite: if both ends renegotiate at once, theirs
      // is the offer that gets rolled back, not ours.
      peer.open(false, hooks)
      await peer.capture(kind)
      // Hung up while the permission prompt was open: the stream we were just
      // handed has to be given back, or the camera light stays on.
      if (seq !== mine) return peer.close()
      emit({ s: 'invite', callId, kind, sdp: await peer.offer() }, '')
    }
    catch (error) {
      console.warn('[rtc] could not start the call', error)
      failCall(kind === 'video' ? 'Camera unavailable' : 'Microphone unavailable')
      return
    }

    at(() => endCall('no-answer'), RING_TIMEOUT)
  }

  /* ---------- Incoming ---------- */

  function ringIncoming(
    name: string,
    kind: CallKind,
    opts: { room?: string, simulated?: boolean } = {},
  ) {
    if (call.value) return
    clearStage()
    ended.value = null
    seq++
    call.value = {
      name,
      room: opts.room ?? name,
      face: faceOf(name),
      kind,
      direction: 'in',
      secs: 0,
      muted: false,
      cam: kind === 'video',
      remoteCam: kind === 'video',
      speaker: false,
      answered: false,
      connected: false,
      simulated: opts.simulated,
    }
    announce(`Incoming ${kind} call from ${name}`)
    toastOpen.value = true

    at(() => endCall('no-answer'), RING_TIMEOUT) // nobody picked up
  }

  /** The sidebar's demo ringer: a call screen with no peer behind it. */
  function simulateIncoming() {
    if (call.value) return
    const pool = store.chats.value
    const from = pool[Math.floor(Math.random() * pool.length)]?.name || store.current.value
    forget()
    ringIncoming(from, Math.random() < 0.3 ? 'video' : 'voice', { simulated: true })
  }

  async function acceptCall() {
    const live = call.value
    if (!live || live.direction !== 'in' || live.answered) return
    clearStage()
    live.answered = true
    toastOpen.value = false
    overlayOpen.value = true

    // Nothing to negotiate with: the demo ringer connects to itself.
    if (live.simulated) {
      connect(live)
      return
    }

    const offer = heldOffer
    if (!offer) return failCall('Call unavailable')
    status.value = 'Connecting…'

    const mine = seq
    try {
      // The callee is polite, and yields on a renegotiation collision.
      peer.open(true, hooks)
      await peer.capture(live.kind)
      if (seq !== mine) return peer.close()
      const sdp = await peer.answerTo(offer)
      if (sdp) emit({ s: 'accept', callId, sdp })
      flushIce()
    }
    catch (error) {
      console.warn('[rtc] could not answer the call', error)
      failCall(live.kind === 'video' ? 'Camera unavailable' : 'Microphone unavailable')
    }
  }

  /* ---------- Frames off the socket ---------- */

  /** Everything the far end sends us, from the first ring to the hangup. */
  async function handleCall(frame: Extract<ServerMessage, { t: 'call' }>) {
    const { from, room, signal } = frame
    const live = call.value

    if (signal.s === 'invite') {
      // Busy, or already talking to somebody else: turn them away rather than
      // leave a phone ringing at an end that will never pick up.
      if (live) {
        transport.value?.sendCall(room, { s: 'end', callId: signal.callId, reason: 'busy' }, from.id)
        return
      }
      forget()
      callId = signal.callId
      peerId = from.id
      heldOffer = signal.sdp
      ringIncoming(from.name, signal.kind, { room })
      emit({ s: 'ring', callId })
      return
    }

    // Anything else belongs to a call we are actually in.
    if (!live || signal.callId !== callId) return

    switch (signal.s) {
      case 'ring':
        if (!live.connected) status.value = 'Ringing…'
        break

      case 'accept': {
        if (live.direction !== 'out') break
        // A second device answering has lost the race; the first one owns the
        // connection, and telling this one keeps its screen from hanging.
        if (peerId && peerId !== from.id) {
          transport.value?.sendCall(
            room,
            { s: 'end', callId, reason: 'answered-elsewhere' },
            from.id,
          )
          break
        }
        peerId = from.id
        clearStage()
        status.value = 'Connecting…'
        await peer.applyAnswer(signal.sdp)
        flushIce()
        break
      }

      case 'offer': {
        // They switched a camera on: same connection, new description.
        const sdp = await peer.answerTo(signal.sdp)
        if (sdp) emit({ s: 'answer', callId, sdp })
        break
      }

      case 'answer':
        await peer.applyAnswer(signal.sdp)
        break

      case 'ice':
        await peer.addIce(signal.candidate)
        break

      case 'media':
        live.remoteCam = signal.cam
        break

      case 'end':
        endCall(signal.reason, { remote: true })
        break
    }
  }

  /* ---------- Hanging up ---------- */

  function endCall(reason: CallEndReason, opts: { remote?: boolean } = {}) {
    const live = call.value
    if (!live) return
    clearStage()
    if (ticker) clearInterval(ticker)
    ticker = null

    // Tell the other end, unless they are the ones who just told us. With no
    // peer yet it goes to the room, so every device that is ringing stops.
    if (!opts.remote) emit({ s: 'end', callId, reason })
    peer.close()
    forget()

    // Logged against the conversation, not the person, so both ends file the
    // call in the same place — and next to the messages about it.
    const { room, kind, direction, secs, connected, answered } = live

    // Never picked up: no call screen was ever shown.
    if (direction === 'in' && !answered) {
      toastOpen.value = false
      ended.value = live
      call.value = null
      store.logCall(room, {
        kind,
        missed: true,
        av: faceOf(room).av,
        text: reason === 'declined' ? `Declined ${kind} call` : `Missed ${kind} call`,
      })
      return
    }

    status.value = connected ? 'Call ended' : endedLabel(reason)
    const closing = seq
    ended.value = live
    call.value = null
    store.logCall(room, {
      kind,
      missed: !connected,
      av: faceOf(room).av,
      text: connected
        ? `${kind === 'video' ? 'Video' : 'Voice'} call · ${callDuration(secs)}`
        : `${endedLabel(reason)} ${kind} call`,
      preview: connected ? callDuration(secs) : undefined,
    })
    at(() => {
      if (seq !== closing) return
      overlayOpen.value = false
    }, motionMs(850))
  }

  /** How a call that never connected is described, to the screen and the log. */
  function endedLabel(reason: CallEndReason): string {
    if (reason === 'declined') return 'Declined'
    if (reason === 'no-answer') return 'Unanswered'
    if (reason === 'busy') return 'Busy'
    if (reason === 'failed') return 'Failed'
    return 'Cancelled'
  }

  /** Escape hangs up, or declines a call that was never answered. */
  function escapeCall() {
    const live = call.value
    if (!live) return
    endCall(live.direction === 'in' && !live.answered ? 'declined' : 'hangup')
  }

  /* ---------- In-call toggles ---------- */

  function toggleMute() {
    const live = call.value
    if (!live) return
    live.muted = !live.muted
    peer.enableMic(!live.muted)
  }

  async function toggleCam() {
    const live = call.value
    if (!live) return
    live.cam = !live.cam
    if (live.cam) live.kind = 'video' // camera on upgrades the call

    if (live.simulated) return

    try {
      // Only the first camera-on adds a track, and only that needs a new
      // offer; after it, the far end already has somewhere to put the picture.
      if (await peer.enableCam(live.cam)) {
        emit({ s: 'offer', callId, sdp: await peer.offer() })
      }
      emit({ s: 'media', callId, cam: live.cam })
    }
    catch (error) {
      console.warn('[rtc] camera unavailable', error)
      live.cam = false
      announce('Camera unavailable')
    }
  }

  function toggleSpeaker() {
    if (call.value) call.value.speaker = !call.value.speaker
  }

  return {
    call,
    screen,
    status,
    flags,
    overlayOpen,
    toastOpen,
    localStream: peer.localStream,
    remoteStream: peer.remoteStream,
    remoteVideo,
    startCall,
    ringIncoming,
    simulateIncoming,
    acceptCall,
    endCall,
    escapeCall,
    handleCall,
    toggleMute,
    toggleCam,
    toggleSpeaker,
  }
}
