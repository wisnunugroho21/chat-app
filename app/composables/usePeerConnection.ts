import type { CallKind, IceCandidateWire } from '#shared/types/wire'

/**
 * One `RTCPeerConnection` and the microphone and camera hanging off it.
 *
 * Everything here is mechanism: it acquires media, produces and consumes SDP,
 * and reports when the connection comes up. It knows nothing about rooms,
 * signalling frames or the call UI — `useCallCenter` is what joins those to
 * this. Only one call runs at a time, so the connection lives in module scope
 * next to the streams the overlay renders.
 */

export interface PeerHooks {
  /** A local candidate to hand the far end. */
  onIce: (candidate: IceCandidateWire) => void
  /** Media is flowing — start the duration clock. */
  onConnected: () => void
  /** ICE gave up. There is no coming back from this one. */
  onFailed: () => void
}

const localStream = shallowRef<MediaStream | null>(null)
const remoteStream = shallowRef<MediaStream | null>(null)

let pc: RTCPeerConnection | null = null
let hooks: PeerHooks | null = null
/** Candidates that arrived before the description they belong to. */
let earlyIce: IceCandidateWire[] = []
/** On a glare collision the polite peer yields; the impolite one carries on. */
let polite = false

const CAMERA: MediaTrackConstraints = { width: { ideal: 1280 }, facingMode: 'user' }

export function usePeerConnection() {
  const config = useRuntimeConfig().public.webrtc

  /**
   * STUN is what lets two browsers on different networks find each other.
   * Between tabs on one machine the host candidates already match, which is
   * why the default works with no configuration at all.
   */
  function iceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = []
    const stun = (config?.stunUrls || '').split(',').map(url => url.trim()).filter(Boolean)
    if (stun.length) servers.push({ urls: stun })
    // A TURN relay is the only thing that gets through symmetric NAT; without
    // one, calls between some networks will never connect.
    if (config?.turnUrl) {
      servers.push({
        urls: config.turnUrl,
        username: config.turnUsername || undefined,
        credential: config.turnCredential || undefined,
      })
    }
    return servers
  }

  const hasVideo = (stream: MediaStream | null) =>
    !!stream?.getVideoTracks().some(track => track.readyState === 'live')

  /** Fresh connection. `asPolite` decides who yields if both renegotiate. */
  function open(asPolite: boolean, next: PeerHooks): RTCPeerConnection {
    close()
    polite = asPolite
    hooks = next

    const connection = new RTCPeerConnection({ iceServers: iceServers() })

    connection.onicecandidate = (event) => {
      if (!event.candidate) return // the null candidate only means "done"
      const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = event.candidate
      hooks?.onIce({ candidate, sdpMid, sdpMLineIndex, usernameFragment })
    }

    connection.ontrack = (event) => {
      // One stream carries both tracks, so a video arriving later lands in the
      // same object the overlay is already showing.
      remoteStream.value = event.streams[0] ?? new MediaStream([event.track])
      triggerRef(remoteStream)
    }

    connection.onconnectionstatechange = () => {
      // 'disconnected' is often a blip on the way back to 'connected', so only
      // an outright failure ends the call.
      if (connection.connectionState === 'connected') hooks?.onConnected()
      if (connection.connectionState === 'failed') hooks?.onFailed()
    }

    pc = connection
    return connection
  }

  /** Microphone, plus the camera when the call is a video one. */
  async function capture(kind: CallKind): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? CAMERA : false,
    })
    localStream.value = stream
    for (const track of stream.getTracks()) pc?.addTrack(track, stream)
    return stream
  }

  /**
   * A frame can always arrive for a call that has just been torn down, so
   * every one of these is a no-op once the connection is gone.
   */
  async function offer(): Promise<string> {
    if (!pc) return ''
    await pc.setLocalDescription(await pc.createOffer())
    return pc.localDescription?.sdp ?? ''
  }

  /**
   * Answer an offer. Returns `null` when both ends renegotiated at once and
   * this is the peer that agreed to back down.
   */
  async function answerTo(sdp: string): Promise<string | null> {
    if (!pc) return null

    const collision = pc.signalingState !== 'stable'
    if (collision && !polite) return null
    if (collision) await pc.setLocalDescription({ type: 'rollback' })

    await pc.setRemoteDescription({ type: 'offer', sdp })
    await drainIce()
    await pc.setLocalDescription(await pc.createAnswer())
    return pc.localDescription?.sdp ?? null
  }

  async function applyAnswer(sdp: string) {
    // A duplicate accept, or one arriving after we gave up, would throw here.
    if (pc?.signalingState !== 'have-local-offer') return
    await pc.setRemoteDescription({ type: 'answer', sdp })
    await drainIce()
  }

  /** Candidates are useless until there is a remote description to attach
   *  them to, and they routinely arrive first. */
  async function addIce(candidate: IceCandidateWire) {
    if (!pc) return
    if (!pc.remoteDescription) {
      earlyIce.push(candidate)
      return
    }
    await pc.addIceCandidate(candidate).catch(error => console.warn('[rtc] bad candidate', error))
  }

  async function drainIce() {
    const queued = earlyIce
    earlyIce = []
    for (const candidate of queued) {
      await pc?.addIceCandidate(candidate).catch(() => {})
    }
  }

  function enableMic(on: boolean) {
    for (const track of localStream.value?.getAudioTracks() ?? []) track.enabled = on
  }

  /**
   * Turn the camera on or off. Returns true when a track had to be added,
   * which is the one case that needs renegotiating — after that the track
   * stays in place and toggling only flips `enabled`, so a camera going on
   * and off mid-call costs nothing.
   */
  async function enableCam(on: boolean): Promise<boolean> {
    const stream = localStream.value
    if (!stream) return false

    const existing = stream.getVideoTracks()
    if (existing.length) {
      for (const track of existing) track.enabled = on
      triggerRef(localStream)
      return false
    }
    if (!on) return false

    const fresh = await navigator.mediaDevices.getUserMedia({ video: CAMERA })
    const track = fresh.getVideoTracks()[0]
    if (!track) return false
    stream.addTrack(track)
    pc?.addTrack(track, stream)
    // The ref holds the same MediaStream object it always did.
    triggerRef(localStream)
    return true
  }

  /** Release the camera light and drop the connection. */
  function close() {
    for (const track of localStream.value?.getTracks() ?? []) track.stop()
    localStream.value = null
    remoteStream.value = null
    earlyIce = []
    hooks = null

    if (!pc) return
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
    pc = null
  }

  return {
    localStream,
    remoteStream,
    hasVideo,
    open,
    capture,
    offer,
    answerTo,
    applyAnswer,
    addIce,
    enableMic,
    enableCam,
    close,
  }
}
