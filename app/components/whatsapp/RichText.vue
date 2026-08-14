<script setup lang="ts">
/** Renders **double asterisks** as bold, without reaching for v-html. */
const props = defineProps<{ text: string }>()

const segments = computed(() => boldSegments(props.text))
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i">
    <b v-if="segment.bold">{{ segment.text }}</b>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
