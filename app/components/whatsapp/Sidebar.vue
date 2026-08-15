<script setup lang="ts">
import type { PushState } from '~/composables/usePush'
import type { FilterKey } from '~/types/whatsapp'

const store = useWhatsappStore()
const panel = useNewChatPanel()
const calls = useCallCenter()
const realtime = useRealtime()
const push = usePush()
const { openMenu, say, busy } = useWhatsappOverlays()

const { query, activeFilter, visibleChats } = store

const FILTER_CHIPS: { key: FilterKey, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'favourites', label: 'Favourites' },
  { key: 'groups', label: 'Groups' },
]

const searchInput = ref<HTMLInputElement | null>(null)

function clearSearch() {
  store.clearSearch()
  searchInput.value?.focus({ preventScroll: true })
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    store.clearSearch()
    return
  }
  if (event.key === 'Enter') {
    // Jump straight into the top result.
    const first = visibleChats.value[0]
    if (first) store.openChat(first.name)
  }
}

/** Connection state, in the words WhatsApp Web uses for it. */
const connectionNote = computed(() => {
  if (realtime.status.value === 'connecting') return 'Menyambungkan…'
  if (realtime.status.value === 'offline') return 'Koneksi terputus. Mencoba menyambung ulang…'
  return ''
})

const PUSH_NOTE: Record<PushState, string> = {
  ready: 'Notifikasi aktif',
  denied: 'Notifikasi diblokir di setelan browser',
  unsupported: 'Browser ini tidak mendukung notifikasi',
  unconfigured: 'Firebase belum dikonfigurasi — lihat .env.example',
  idle: 'Notifikasi belum aktif',
}

async function toggleNotifications() {
  if (push.enabled.value) {
    await push.disable()
    say('Notifikasi dimatikan')
    return
  }
  say(PUSH_NOTE[await push.enable()])
}

function listMenu(event: MouseEvent) {
  openMenu(event.currentTarget as HTMLElement, [
    {
      icon: push.enabled.value ? 'notifications_off' : 'notifications',
      label: push.enabled.value ? 'Turn off notifications' : 'Enable notifications',
      run: toggleNotifications,
    },
    {
      icon: 'refresh',
      label: 'Refresh',
      run: anchor => busy(anchor, () => say('Daftar chat dimuat ulang')),
    },
  ])
}

// Hand an unmatched search over to the contact picker.
function startNewChatFromSearch() {
  panel.openPanel(false, query.value.trim())
}
</script>

<template>
  <aside class="sidebar">
    <header class="side-head">
      <h1 class="side-title">Chats</h1>
      <button
        class="icon-btn"
        aria-label="Simulate an incoming call"
        title="Simulate an incoming call"
        @click="calls.simulateIncoming()"
      >
        <span class="material-symbols-outlined">phone_callback</span>
      </button>
      <button class="icon-btn" aria-label="New chat" @click="panel.openPanel(false)">
        <span class="material-symbols-outlined">chat_add_on</span>
      </button>
      <button
        class="icon-btn"
        aria-label="Chat list options"
        aria-haspopup="menu"
        aria-expanded="false"
        @click.stop="listMenu"
      >
        <span class="material-symbols-outlined">more_vert</span>
      </button>
    </header>

    <!-- The socket exists only in the browser, so there is nothing for the
         server to render here and nothing to hydrate against. -->
    <ClientOnly>
      <Transition name="net">
        <div v-if="connectionNote" class="net-banner" role="status">
          <span class="material-symbols-outlined">cloud_off</span>
          {{ connectionNote }}
        </div>
      </Transition>
    </ClientOnly>

    <div class="search-wrap">
      <div class="search">
        <span class="material-symbols-outlined">search</span>
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Search or start a new chat"
          aria-label="Search chats"
          @keydown="onSearchKeydown"
        >
        <button
          v-if="query"
          class="search-clear"
          type="button"
          aria-label="Clear search"
          @click="clearSearch"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>

    <div class="filters" role="group" aria-label="Filter chats">
      <button
        v-for="chip in FILTER_CHIPS"
        :key="chip.key"
        class="chip"
        :aria-pressed="activeFilter === chip.key"
        @click="activeFilter = chip.key"
      >
        {{ chip.label }}
      </button>
    </div>

    <WhatsappChatList @start-new-chat="startNewChatFromSearch" />

    <WhatsappNewChatPanel />
  </aside>
</template>

<style scoped>
/* WhatsApp Web's own "phone not connected" strip, in this palette. */
.net-banner {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    background: var(--panel-4);
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 13px;
}

.net-banner .material-symbols-outlined {
    font-size: 18px;
}

.net-enter-active,
.net-leave-active {
    transition: opacity 160ms ease;
}

.net-enter-from,
.net-leave-to {
    opacity: 0;
}
</style>
