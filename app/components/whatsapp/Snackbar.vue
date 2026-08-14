<script setup lang="ts">
const { snackText, snackOpen } = useWhatsappOverlays()
</script>

<template>
  <Transition name="snack">
    <div v-if="snackOpen" class="snack" role="status">
      {{ snackText }}
    </div>
  </Transition>
</template>

<style scoped>
/* `.snack` already centres itself with translateX(-50%); the enter state
   only adds the lift on top of it. */
.snack-enter-active,
.snack-leave-active {
    transition: opacity 200ms ease-out, transform 160ms ease-out;
}

.snack-enter-from {
    opacity: 0;
    transform: translate(-50%, 8px);
}

.snack-leave-to {
    opacity: 0;
}
</style>
