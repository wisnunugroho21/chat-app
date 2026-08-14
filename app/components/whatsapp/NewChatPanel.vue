<script setup lang="ts">
import type { Contact } from '~/types/whatsapp'

const panel = useNewChatPanel()
const { openMenu, closeMenu, say, busy } = useWhatsappOverlays()

const {
  open,
  groupMode,
  search,
  groupName,
  selected,
  focusTick,
  results,
  sections,
  title,
  subtitle,
} = panel

const searchInput = ref<HTMLInputElement | null>(null)
const chips = computed(() => [...selected.value.values()])

/** The "New group" shortcut only heads an unfiltered, one-to-one list. */
const showsGroupShortcut = computed(() => !groupMode.value && !search.value.trim())

// Focus lands once the panel has finished sliding in.
watch(focusTick, async () => {
  await nextTick()
  setTimeout(() => searchInput.value?.focus({ preventScroll: true }), SLIDE_MS)
})

function contactMenu(anchor: HTMLElement, name: string) {
  openMenu(anchor, [
    {
      icon: 'refresh',
      label: 'Refresh',
      run: a => busy(a, () => say(`Kontak ${name} dimuat ulang`)),
    },
  ])
}

function onCreateKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && selected.value.size) panel.createGroup()
}

function pick(contact: Contact) {
  panel.pickContact(contact)
}
</script>

<template>
  <Transition name="np-slide">
    <section v-if="open" class="new-chat" aria-label="New chat">
      <header class="side-head np-head">
        <button class="icon-btn" aria-label="Back to chats" @click="panel.back()">
          <span class="material-symbols-outlined">arrow_left_alt</span>
        </button>
        <div class="np-title">
          <div class="np-name">{{ title }}</div>
          <div class="np-sub">{{ subtitle }}</div>
        </div>
      </header>

      <div class="search-wrap">
        <div class="search">
          <span class="material-symbols-outlined">search</span>
          <input
            ref="searchInput"
            v-model="search"
            type="search"
            placeholder="Search name or number"
            aria-label="Search contacts"
          >
        </div>
      </div>

      <div class="np-list scroll" @scroll="closeMenu()">
        <button
          v-if="showsGroupShortcut"
          class="contact"
          type="button"
          @click="panel.openPanel(true)"
        >
          <span class="c-icon material-symbols-outlined">group</span>
          <div class="c-body">
            <div class="c-name">New group</div>
            <div class="c-about">Kumpulkan tim dispatch dalam satu chat</div>
          </div>
        </button>

        <div v-if="!results.length" class="np-empty">
          Tidak ada kontak bernama “{{ search.trim() }}”. Coba nama lain.
        </div>

        <template v-else>
          <template v-for="section in sections" :key="section.letter">
            <div class="np-section">{{ section.letter }}</div>
            <WhatsappContactRow
              v-for="contact in section.contacts"
              :key="contact.name"
              :contact="contact"
              :picked="groupMode && selected.has(contact.name)"
              @pick="pick(contact)"
              @menu="contactMenu($event, contact.name)"
            />
          </template>
        </template>
      </div>

      <footer v-if="groupMode" class="np-foot">
        <div class="np-chips">
          <span v-if="!chips.length" class="np-hint">Pick the people to add</span>
          <span v-for="contact in chips" :key="contact.name" class="np-chip">
            <span class="dot avatar" :class="contact.av">{{ initials(contact.name) }}</span>
            {{ contact.name }}
            <button
              type="button"
              :aria-label="`Remove ${contact.name}`"
              @click="panel.removeContact(contact.name)"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </span>
        </div>
        <div class="np-make">
          <div class="field">
            <input
              v-model="groupName"
              type="text"
              placeholder="Group name"
              aria-label="Group name"
              @keydown="onCreateKeydown"
            >
          </div>
          <button
            class="np-fab"
            aria-label="Create group"
            :disabled="!selected.size"
            @click="panel.createGroup()"
          >
            <span class="material-symbols-outlined">arrow_right_alt</span>
          </button>
        </div>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
/* The slide in and out. The global reduced-motion rule flattens it. */
.np-slide-enter-active,
.np-slide-leave-active {
    transition: transform 220ms ease;
}

.np-slide-enter-from,
.np-slide-leave-to {
    transform: translateX(-102%);
}
</style>
