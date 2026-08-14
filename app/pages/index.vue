<script setup lang="ts">
const { railHidden, listVisible, chatVisible, watchViewport } = useWhatsappLayout()
const { announcement, menuOpen, dismissMenu } = useWhatsappOverlays()
const panel = useNewChatPanel()
const calls = useCallCenter()

useHead({ title: 'WhatsApp' })

/**
 * One Escape listener, one explicit order. Three separate listeners used to
 * race: the panel's ran before the menu's, so Escape on an open menu tore
 * down the whole panel with it.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  // 1. innermost first
  if (menuOpen.value) {
    dismissMenu()
    return
  }
  // 2. the new-chat panel
  if (panel.open.value) {
    panel.closePanel()
    return
  }
  // 3. a live call — but never from inside a text field, where Escape means
  //    "clear this input"
  const inField
    = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
  if (!inField) calls.escapeCall()
}

onMounted(() => {
  watchViewport()
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="wa-root">
    <div class="app" :class="{ 'pane-chat': railHidden }">
      <WhatsappNavRail />
      <WhatsappSidebar v-show="listVisible" />
      <WhatsappChatPanel v-show="chatVisible" />
    </div>

    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>

    <WhatsappContextMenu />
    <WhatsappSnackbar />
    <WhatsappCallOverlay />
    <WhatsappIncomingCallToast />
  </div>
</template>

<style scoped>
/* The page wrapper only exists to give the route a single root; it must not
   sit between <body>'s grid and `.app`. */
.wa-root {
    display: contents;
}
</style>
