<script setup lang="ts">
import type { DeliveryStatus } from '~/types/whatsapp'

/**
 * Delivery ticks. WhatsApp's own glyph: one chevron for sent, two for
 * delivered, two in blue once read.
 */
const props = withDefaults(defineProps<{ status?: DeliveryStatus }>(), {
  status: 'read',
})

const LABELS: Record<DeliveryStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
}

const label = computed(() => LABELS[props.status] || 'Read')
</script>

<template>
  <span class="tick" :class="{ read: status === 'read' }" role="img" :aria-label="label">
    <svg
      viewBox="0 0 16 11"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <template v-if="status === 'sent'">
        <path d="M3.4 5.8 6 8.5l6.1-6.6" />
      </template>
      <template v-else>
        <path d="M1 5.8 3.6 8.5l6.1-6.6" />
        <path d="M6.3 5.8 8.9 8.5 15 1.9" />
      </template>
    </svg>
  </span>
</template>
