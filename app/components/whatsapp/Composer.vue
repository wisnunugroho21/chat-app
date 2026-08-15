<script setup lang="ts">
const store = useWhatsappStore()
const { composerFocus } = store

const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

/** Typing is presence, not history: announce it, then let it lapse. */
const TYPING_IDLE_MS = 2500
let typing = false
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** `room` names the conversation being told, which is not always the open one. */
function stopTyping(room?: string) {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (!typing) return
  typing = false
  store.notifyTyping(false, room)
}

function onInput() {
  if (!typing) {
    typing = true
    store.notifyTyping(true)
  }
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS)
}

function send() {
  if (!draft.value.trim()) return
  stopTyping()
  store.send(draft.value)
  draft.value = ''
}

// Switching conversations must not leave a typing bubble behind in the old
// one — so it is the chat we just left that has to be told, by name.
watch(() => store.current.value, (_next, previous) => stopTyping(previous))
onBeforeUnmount(() => stopTyping())

// Opening a chat, and sending, both hand the caret back to the message box.
watch(composerFocus, async () => {
  await nextTick()
  input.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div class="composer">
    <button class="icon-btn" aria-label="Emoji">
      <span class="material-symbols-outlined">mood</span>
    </button>
    <button class="icon-btn" aria-label="Attach file">
      <span class="material-symbols-outlined">attach_file</span>
    </button>
    <div class="field">
      <input
        ref="input"
        v-model="draft"
        class="msg-input"
        type="text"
        placeholder="Type a message"
        aria-label="Type a message"
        @input="onInput"
        @keydown.enter="send"
      >
    </div>
    <button class="icon-btn btn-mic" aria-label="Record voice message">
      <span class="material-symbols-outlined">mic</span>
    </button>
    <button class="icon-btn btn-send" aria-label="Send message" @click="send">
      <span class="material-symbols-outlined">send</span>
    </button>
  </div>
</template>
