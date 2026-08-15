<script setup lang="ts">
const calls = useCallCenter()
// `screen` outlives `call` through the closing fade, so the card keeps the
// name and colours it had while hanging up.
const { call, screen, status, flags, overlayOpen, localStream, remoteStream, remoteVideo } = calls

const faceEl = ref<HTMLElement | null>(null)
const endBtn = ref<HTMLElement | null>(null)

/**
 * Where the call is actually heard and seen.
 *
 * The audio element is the only thing that plays sound, and it is mounted for
 * the whole call — a voice call has no video element to carry it, and a muted
 * one would be silent. Both video elements are muted for that reason: the
 * remote picture would otherwise double the audio, and the self view would
 * feed the microphone straight back.
 */
const remoteAudioEl = ref<HTMLAudioElement | null>(null)
const remoteVideoEl = ref<HTMLVideoElement | null>(null)
const selfVideoEl = ref<HTMLVideoElement | null>(null)

/** Own camera preview, only once there is a picture to show. */
const selfVideo = computed(() => !!call.value?.cam && !call.value?.simulated)

function attach(el: HTMLMediaElement | null, stream: MediaStream | null) {
  if (!el || el.srcObject === stream) return
  el.srcObject = stream
  // Autoplay is allowed here — placing or answering a call is the gesture.
  if (stream) el.play().catch(() => {})
}

// The video elements come and go with `v-if`, so the streams are re-attached
// whenever either the element or the stream changes.
watch([remoteAudioEl, remoteStream], () => attach(remoteAudioEl.value, remoteStream.value), { immediate: true })
watch([remoteVideoEl, remoteStream], () => attach(remoteVideoEl.value, remoteStream.value), { immediate: true })
watch([selfVideoEl, localStream], () => attach(selfVideoEl.value, localStream.value), { immediate: true })
/** Blooms the contact's own colour behind them — WhatsApp blurs their photo
 *  across the whole call screen. */
const face = ref('')

/** Our own camera: what the self view and the camera button reflect. */
const cam = computed(() => !!screen.value?.cam)

/**
 * Whether the screen is a video one at all. Either camera is enough: a voice
 * call the far end turns a camera on during still has to make room for their
 * picture, and the card is laid out around the stage being there.
 */
const videoMode = computed(() => cam.value || remoteVideo.value)

watch(
  [overlayOpen, () => screen.value?.face.av],
  async () => {
    if (!overlayOpen.value) return
    await nextTick()
    if (faceEl.value) face.value = getComputedStyle(faceEl.value).backgroundColor
    endBtn.value?.focus({ preventScroll: true })
  },
  { immediate: true },
)
</script>

<template>
  <Transition name="call">
    <div
      v-if="overlayOpen"
      class="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Call"
    >
      <div
        class="call-card"
        :class="{ 'is-video': videoMode }"
        :style="face ? { '--face': face } : undefined"
      >
        <div class="call-bg" aria-hidden="true" />

        <!-- Their sound, for the whole call — a voice call has no picture to
             carry it. -->
        <audio ref="remoteAudioEl" autoplay />

        <!-- The far end's camera. Absent while the call is voice only. -->
        <div v-if="videoMode" class="call-stage">
          <video
            v-show="remoteVideo"
            ref="remoteVideoEl"
            class="call-video"
            autoplay
            playsinline
            muted
          />
          <div v-show="!remoteVideo" class="avatar" :class="screen?.face.av">
            {{ screen?.face.initials }}
          </div>
        </div>

        <!-- Your own picture-in-picture, only while your camera is on. -->
        <div v-if="cam" class="call-self">
          <video
            v-if="selfVideo"
            ref="selfVideoEl"
            class="call-video mirror"
            autoplay
            playsinline
            muted
          />
          <template v-else>
            <span class="material-symbols-outlined">person</span>
            You
          </template>
        </div>

        <div class="call-top">
          <div class="call-e2e">
            <span class="material-symbols-outlined">lock</span>
            End-to-end encrypted
          </div>
        </div>

        <div class="call-who">
          <div
            v-show="!videoMode"
            ref="faceEl"
            class="avatar"
            :class="[screen?.face.av, { ringing: screen && !screen.connected }]"
          >
            {{ screen?.face.initials }}
          </div>
          <div class="call-name">{{ screen?.name || '—' }}</div>
          <div class="call-status">{{ status }}</div>
          <div class="call-flags">{{ flags }}</div>
        </div>

        <div class="call-controls">
          <button
            class="call-btn"
            :class="{ on: call?.speaker }"
            :aria-pressed="!!call?.speaker"
            aria-label="Speaker"
            @click="calls.toggleSpeaker()"
          >
            <span class="material-symbols-outlined">volume_up</span>
          </button>
          <button
            class="call-btn"
            :class="{ on: cam }"
            :aria-pressed="cam"
            :aria-label="cam ? 'Turn camera off' : 'Turn camera on'"
            @click="calls.toggleCam()"
          >
            <span class="material-symbols-outlined">{{ cam ? 'videocam' : 'videocam_off' }}</span>
          </button>
          <button
            class="call-btn"
            :class="{ on: call?.muted }"
            :aria-pressed="!!call?.muted"
            :aria-label="call?.muted ? 'Unmute microphone' : 'Mute microphone'"
            @click="calls.toggleMute()"
          >
            <span class="material-symbols-outlined">{{ call?.muted ? 'mic_off' : 'mic' }}</span>
          </button>
          <button ref="endBtn" class="call-btn end" aria-label="End call" @click="calls.endCall('hangup')">
            <span class="material-symbols-outlined">call_end</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.call-enter-active,
.call-leave-active {
    transition: opacity 170ms ease;
}

.call-enter-from,
.call-leave-to {
    opacity: 0;
}

.call-enter-active .call-card {
    transition:
        transform 170ms cubic-bezier(0.2, 0.8, 0.3, 1),
        opacity 170ms ease;
}

.call-enter-from .call-card {
    transform: scale(0.94);
    opacity: 0;
}
</style>
