<script setup lang="ts">
import type { Contact } from '~/types/whatsapp'

const props = withDefaults(
  defineProps<{ contact: Contact, picked?: boolean }>(),
  { picked: false },
)

const emit = defineEmits<{
  pick: []
  menu: [anchor: HTMLElement]
}>()

const label = computed(() => initials(props.contact.name))

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if ((event.target as HTMLElement).closest('.contact-menu')) return
  event.preventDefault()
  emit('pick')
}
</script>

<template>
  <!-- A div, not a button: it contains its own menu button, and nesting
       buttons is invalid. -->
  <div
    class="contact"
    :class="{ sel: picked }"
    role="button"
    tabindex="0"
    :aria-pressed="picked"
    @click="emit('pick')"
    @keydown="onKeydown"
  >
    <WhatsappAvatar :tone="contact.av" :label="label" />
    <div class="c-body">
      <div class="c-name">{{ contact.name }}</div>
      <div class="c-about">{{ contact.about }}</div>
    </div>
    <span v-if="picked" class="c-check material-symbols-outlined">check</span>
    <button
      class="row-menu contact-menu"
      type="button"
      :aria-label="`Options for ${contact.name}`"
      aria-haspopup="menu"
      aria-expanded="false"
      @click.stop="emit('menu', $event.currentTarget as HTMLElement)"
    >
      <span class="material-symbols-outlined">more_vert</span>
    </button>
  </div>
</template>
