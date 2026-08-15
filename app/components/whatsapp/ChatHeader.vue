<script setup lang="ts">
const store = useWhatsappStore()
const calls = useCallCenter()
const { showPane } = useWhatsappLayout()
const { openMenu, say, busy } = useWhatsappOverlays()

const { currentChat } = store

const label = computed(() => (currentChat.value ? faceInitials(currentChat.value) : ''))
/** What this conversation is called, which is not always its room key. */
const title = computed(() => (currentChat.value ? chatTitle(currentChat.value) : ''))

/** Reload the open conversation. */
function chatMenu(event: MouseEvent) {
  openMenu(event.currentTarget as HTMLElement, [
    {
      icon: 'refresh',
      label: 'Refresh',
      run: anchor => busy(anchor, () => say(`Chat dengan ${title.value} dimuat ulang`)),
    },
  ])
}
</script>

<template>
  <div class="chat-head">
    <span
      class="back-btn material-symbols-outlined"
      role="button"
      tabindex="0"
      @click="showPane('list')"
    >
      arrow_left_alt
    </span>

    <WhatsappAvatar v-if="currentChat" :tone="currentChat.av" :label="label" />

    <div class="ch-info">
      <div class="ch-name">{{ title }}</div>
      <div class="ch-sub">{{ currentChat?.sub || 'online' }}</div>
    </div>

    <button class="icon-btn" aria-label="Voice call" @click="calls.startCall('voice')">
      <span class="material-symbols-outlined">call</span>
    </button>
    <button class="icon-btn" aria-label="Video call" @click="calls.startCall('video')">
      <span class="material-symbols-outlined">videocam</span>
    </button>
    <button
      class="icon-btn"
      aria-label="Chat options"
      aria-haspopup="menu"
      aria-expanded="false"
      @click.stop="chatMenu"
    >
      <span class="material-symbols-outlined">more_vert</span>
    </button>
  </div>
</template>
