<script setup lang="ts">
import type { FilterKey } from '~/types/whatsapp'

const store = useWhatsappStore()
const panel = useNewChatPanel()
const calls = useCallCenter()
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

/** Reload every conversation. */
function listMenu(event: MouseEvent) {
  openMenu(event.currentTarget as HTMLElement, [
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
