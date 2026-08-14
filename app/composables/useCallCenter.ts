import { CONTACTS } from '~/data/contacts'
import type { Call, CallFace, CallKind } from '~/types/whatsapp'

// A call only ever exists on the client, so module scope is safe here.
const call = ref<Call | null>(null)
/** The call that just ended, held only until its screen has faded out. */
const ended = ref<Call | null>(null)
const status = ref('Calling…')
const overlayOpen = ref(false)
const toastOpen = ref(false)

let seq = 0 // increments per call, so stale timers can tell
let ticker: ReturnType<typeof setInterval> | null = null
let stage: ReturnType<typeof setTimeout>[] = [] // stand-ins for the far end

const at = (fn: () => void, ms: number) => stage.push(setTimeout(fn, ms))
const clearStage = () => {
  stage.forEach(clearTimeout)
  stage = []
}

export function useCallCenter() {
  const store = useWhatsappStore()
  const { announce } = useWhatsappOverlays()
  const { motionMs } = useWhatsappLayout()

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

  function connect(live: Call) {
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

  /* ---------- Outgoing ---------- */
  function startCall(kind: CallKind) {
    if (call.value) return // one line at a time
    clearStage() // drop anything still pending from the last call
    ended.value = null
    seq++
    call.value = {
      name: store.current.value,
      face: faceOf(store.current.value),
      kind,
      direction: 'out',
      secs: 0,
      muted: false,
      cam: kind === 'video',
      speaker: false,
      answered: true,
      connected: false,
    }
    status.value = 'Calling…'
    overlayOpen.value = true

    // Stand-in for the far end — replace with hub events.
    at(() => (status.value = 'Ringing…'), 1300)
    at(() => call.value && connect(call.value), 4200)
  }

  /* ---------- Incoming ---------- */
  function ringIncoming(name: string, kind: CallKind) {
    if (call.value) return
    clearStage()
    ended.value = null
    seq++
    call.value = {
      name,
      face: faceOf(name),
      kind,
      direction: 'in',
      secs: 0,
      muted: false,
      cam: kind === 'video',
      speaker: false,
      answered: false,
      connected: false,
    }
    announce(`Incoming ${kind} call from ${name}`)
    toastOpen.value = true

    at(() => endCall('no-answer'), 25000) // nobody picked up
  }

  /** Stub for the ringing side — swap for a SignalR "IncomingCall" handler. */
  function simulateIncoming() {
    if (call.value) return
    const pool = store.chats.value
    const from = pool[Math.floor(Math.random() * pool.length)]?.name || store.current.value
    ringIncoming(from, Math.random() < 0.3 ? 'video' : 'voice')
  }

  function acceptCall() {
    const live = call.value
    if (!live || live.direction !== 'in' || live.answered) return
    clearStage()
    live.answered = true
    toastOpen.value = false
    overlayOpen.value = true
    connect(live)
  }

  /* ---------- Hanging up ---------- */
  function endCall(reason: 'hangup' | 'declined' | 'no-answer') {
    const live = call.value
    if (!live) return
    clearStage()
    if (ticker) clearInterval(ticker)
    ticker = null

    const { name, kind, direction, secs, connected, answered } = live

    // Never picked up: no call screen was ever shown.
    if (direction === 'in' && !answered) {
      toastOpen.value = false
      ended.value = live
      call.value = null
      store.logCall(name, {
        kind,
        missed: true,
        av: faceOf(name).av,
        text: reason === 'declined' ? `Declined ${kind} call` : `Missed ${kind} call`,
      })
      return
    }

    status.value = connected ? 'Call ended' : 'Call cancelled'
    const closing = seq
    ended.value = live
    call.value = null
    store.logCall(name, {
      kind,
      missed: !connected,
      av: faceOf(name).av,
      text: connected
        ? `${kind === 'video' ? 'Video' : 'Voice'} call · ${callDuration(secs)}`
        : `Cancelled ${kind} call`,
      preview: connected ? callDuration(secs) : undefined,
    })
    at(() => {
      if (seq !== closing) return
      overlayOpen.value = false
    }, motionMs(850))
  }

  /** Escape hangs up, or declines a call that was never answered. */
  function escapeCall() {
    const live = call.value
    if (!live) return
    endCall(live.direction === 'in' && !live.answered ? 'declined' : 'hangup')
  }

  /* ---------- In-call toggles ---------- */
  function toggleMute() {
    if (call.value) call.value.muted = !call.value.muted
  }

  function toggleCam() {
    const live = call.value
    if (!live) return
    live.cam = !live.cam
    if (live.cam) live.kind = 'video' // camera on upgrades the call
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
    startCall,
    ringIncoming,
    simulateIncoming,
    acceptCall,
    endCall,
    escapeCall,
    toggleMute,
    toggleCam,
    toggleSpeaker,
  }
}
