<script setup lang="ts">
import type { MenuItem } from '~/types/whatsapp'

const emit = defineEmits<{ startNewChat: [] }>()

const store = useWhatsappStore()
const { openMenu, closeMenu, say, busy } = useWhatsappOverlays()

const { visibleChats, normalisedQuery, query, activeFilter, current } = store

const nothingHere = computed(
  () => NOTHING_HERE[activeFilter.value] || 'Belum ada chat di sini.',
)

/** Options for one conversation row. */
function rowMenu(anchor: HTMLElement, name: string) {
  const chat = store.chatByName(name)
  const faved = !!chat?.fav
  // Addressed by the room key, spoken about by what the row is called.
  const label = chat ? chatTitle(chat) : name
  const items: MenuItem[] = [
    {
      icon: faved ? 'heart_minus' : 'favorite',
      label: faved ? 'Remove from favourites' : 'Add to favourites',
      run: () => {
        const now = store.toggleFavourite(name)
        say(now ? `${label} ditambahkan ke favorit` : `${label} dihapus dari favorit`)
      },
    },
    {
      icon: 'refresh',
      label: 'Refresh',
      run: a => busy(a, () => say(`${label} dimuat ulang`)),
    },
  ]
  openMenu(anchor, items)
}
</script>

<template>
  <!-- Rows are a projection of the chat store — no chat detail lives here. -->
  <div
    class="chat-list scroll"
    role="listbox"
    aria-label="Conversations"
    @scroll="closeMenu()"
  >
    <template v-if="visibleChats.length">
      <WhatsappChatListItem
        v-for="chat in visibleChats"
        :key="chat.name"
        :chat="chat"
        :query="normalisedQuery"
        :hits="store.messageHits(chat.name, normalisedQuery)"
        :active="chat.name === current"
        @open="store.openChat(chat.name)"
        @menu="rowMenu($event, chat.name)"
      />
    </template>

    <div v-else-if="normalisedQuery" class="list-empty">
      Tidak ada chat yang cocok dengan <b>{{ query.trim() }}</b>.
      <br >Cari nama lain, atau mulai percakapan baru.
      <br ><button type="button" @click="emit('startNewChat')">Start a new chat</button>
    </div>

    <div v-else class="list-empty">
      {{ nothingHere }}
      <template v-if="activeFilter === 'all'">
        <br ><button type="button" @click="emit('startNewChat')">Start a new chat</button>
      </template>
    </div>
  </div>
</template>
