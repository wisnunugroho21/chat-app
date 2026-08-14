<script setup lang="ts">
/** Wraps every occurrence of `query` in the search highlight span. */
const props = withDefaults(defineProps<{ text: string, query?: string }>(), {
  query: '',
})

const segments = computed(() => markSegments(props.text, props.query))
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i">
    <span v-if="segment.hit" class="hl">{{ segment.text }}</span>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
