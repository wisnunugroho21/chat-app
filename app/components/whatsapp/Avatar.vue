<script setup lang="ts">
import type { AvatarTone } from '~/types/whatsapp'

defineProps<{
  tone: AvatarTone
  label: string
}>()
</script>

<template>
  <div class="avatar" :class="tone">
    {{ label }}
  </div>
</template>
