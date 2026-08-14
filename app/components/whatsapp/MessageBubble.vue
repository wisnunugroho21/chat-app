<script setup lang="ts">
import type { Message } from '~/types/whatsapp'

withDefaults(
  defineProps<{
    message: Message
    first?: boolean
    showSender?: boolean
    senderClass?: string
  }>(),
  { first: false, showSender: false, senderClass: '' },
)
</script>

<template>
  <div class="row" :class="[message.out ? 'out' : 'in', { first }]">
    <div class="bubble">
      <div v-if="showSender && message.from" class="sender" :class="senderClass">
        {{ message.from }}
      </div>
      <div v-if="message.quote" class="quote">
        <b>{{ message.quote.author }}</b><span>{{ message.quote.text }}</span>
      </div>
      <div v-if="message.photo" class="photo-ph">
        <span class="material-symbols-outlined">image</span>
      </div>
      <div class="text">
        <WhatsappRichText :text="message.text || ''" />
        <span class="meta">
          {{ message.time }}
          <WhatsappTicks v-if="message.out" :status="message.status" />
        </span>
      </div>
    </div>
  </div>
</template>
