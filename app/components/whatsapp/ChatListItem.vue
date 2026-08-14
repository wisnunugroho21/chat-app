<script setup lang="ts">
import type { Chat } from '~/types/whatsapp'

const props = withDefaults(
  defineProps<{
    chat: Chat
    query?: string
    hits?: number
    active?: boolean
  }>(),
  { query: '', hits: 0, active: false },
)

const emit = defineEmits<{
  open: []
  menu: [anchor: HTMLElement]
}>()

const label = computed(() => faceInitials(props.chat))

/** A hit buried in the conversation replaces the preview line. */
const showsHitCount = computed(
  () =>
    !!props.query
    && !(props.chat.preview || '').toLowerCase().includes(props.query)
    && props.hits > 0,
)

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if ((event.target as HTMLElement).closest('.row-menu')) return
  event.preventDefault()
  emit('open')
}
</script>

<template>
  <div
    class="chat-item"
    :class="{ 'is-active': active, 'is-unread': !!chat.unread }"
    role="option"
    tabindex="0"
    :aria-selected="active"
    @click="emit('open')"
    @keydown="onKeydown"
  >
    <WhatsappAvatar :tone="chat.av" :label="label" />

    <div class="ci-body">
      <div class="ci-name">
        <WhatsappHighlightText :text="chat.name" :query="query" />
      </div>
      <div class="ci-time" :style="chat.unread ? 'color: var(--accent)' : undefined">
        {{ chat.time }}
      </div>
      <div class="ci-msg">
        <span v-if="showsHitCount" class="ci-hits">{{ hits }} pesan cocok</span>
        <template v-else>
          <WhatsappTicks v-if="chat.icon === 'done_all'" :status="chat.status" />
          <span v-else-if="chat.icon" class="material-symbols-outlined">{{ chat.icon }}</span>
          <span><WhatsappHighlightText :text="chat.preview || ''" :query="query" /></span>
        </template>
      </div>
      <div class="ci-meta">
        <span v-if="chat.unread" class="badge">{{ chat.unread }}</span>
      </div>
    </div>

    <button
      class="row-menu"
      type="button"
      :aria-label="`Options for ${chat.name}`"
      aria-haspopup="menu"
      aria-expanded="false"
      @click.stop="emit('menu', $event.currentTarget as HTMLElement)"
    >
      <span class="material-symbols-outlined">more_vert</span>
    </button>
  </div>
</template>
