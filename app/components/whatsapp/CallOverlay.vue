<script setup lang="ts">
const calls = useCallCenter()
// `screen` outlives `call` through the closing fade, so the card keeps the
// name and colours it had while hanging up.
const { call, screen, status, flags, overlayOpen } = calls

const faceEl = ref<HTMLElement | null>(null)
const endBtn = ref<HTMLElement | null>(null)
/** Blooms the contact's own colour behind them — WhatsApp blurs their photo
 *  across the whole call screen. */
const face = ref('')

const cam = computed(() => !!screen.value?.cam)

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
        :class="{ 'is-video': cam }"
        :style="face ? { '--face': face } : undefined"
      >
        <div class="call-bg" aria-hidden="true" />

        <!-- The far end's camera. Hidden on a voice call. -->
        <div v-if="cam" class="call-stage">
          <div class="avatar" :class="screen?.face.av">{{ screen?.face.initials }}</div>
        </div>

        <div v-if="cam" class="call-self">
          <span class="material-symbols-outlined">person</span>
          You
        </div>

        <div class="call-top">
          <div class="call-e2e">
            <span class="material-symbols-outlined">lock</span>
            End-to-end encrypted
          </div>
        </div>

        <div class="call-who">
          <div
            v-show="!cam"
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
