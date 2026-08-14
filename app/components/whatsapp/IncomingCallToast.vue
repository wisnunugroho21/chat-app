<script setup lang="ts">
const calls = useCallCenter()
// `screen` keeps the caller on the card while it slides away.
const { screen, toastOpen } = calls

const acceptBtn = ref<HTMLElement | null>(null)

const kind = computed(() => screen.value?.kind ?? 'voice')

watch(toastOpen, async (open) => {
  if (!open) return
  await nextTick()
  acceptBtn.value?.focus({ preventScroll: true })
})
</script>

<template>
  <Transition name="toast">
    <div v-if="toastOpen" class="call-toast" role="alertdialog" aria-label="Incoming call">
      <div class="ct-top">
        <div class="avatar ringing" :class="screen?.face.av">{{ screen?.face.initials }}</div>
        <div class="ct-body">
          <div class="ct-name">{{ screen?.name || '—' }}</div>
          <div class="ct-sub">
            <span class="material-symbols-outlined">lock</span>
            <span>Incoming {{ kind }} call</span>
          </div>
        </div>
      </div>
      <div class="ct-actions">
        <button class="ct-btn decline" aria-label="Decline call" @click="calls.endCall('declined')">
          <span class="material-symbols-outlined">call_end</span>
        </button>
        <button
          ref="acceptBtn"
          class="ct-btn accept"
          :aria-label="`Accept ${kind} call`"
          @click="calls.acceptCall()"
        >
          <span class="material-symbols-outlined">{{ kind === 'video' ? 'videocam' : 'call' }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
    transition:
        transform 200ms cubic-bezier(0.2, 0.8, 0.3, 1),
        opacity 200ms ease;
}

.toast-enter-from,
.toast-leave-to {
    transform: translateY(14px);
    opacity: 0;
}
</style>
