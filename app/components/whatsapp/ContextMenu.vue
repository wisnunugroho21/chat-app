<script setup lang="ts">
const { menuAnchor, menuItems, menuOpen, closeMenu } = useWhatsappOverlays()
const { motionMs } = useWhatsappLayout()

const menuEl = ref<HTMLElement | null>(null)
const position = ref<Record<string, string>>({ visibility: 'hidden' })

// Measure first, then place: flip up or clamp when near an edge.
watch(menuAnchor, async (anchor) => {
  if (!anchor) return
  position.value = { visibility: 'hidden', left: '0px', top: '0px' }
  await nextTick()

  const el = menuEl.value
  if (!el) return

  const box = anchor.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  let left = Math.min(box.right - w, window.innerWidth - w - 8)
  let top = box.bottom + 6
  if (left < 8) left = 8
  if (top + h > window.innerHeight - 8) top = Math.max(8, box.top - h - 6)

  position.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
  el.animate(
    [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
    { duration: motionMs(120), easing: 'ease-out' },
  )
  el.querySelector<HTMLElement>('.menu-item')?.focus({ preventScroll: true })
})

function choose(index: number) {
  const item = menuItems.value[index]
  const anchor = menuAnchor.value
  closeMenu()
  if (item && anchor) item.run(anchor)
}

function onDocumentClick(event: MouseEvent) {
  if (!menuAnchor.value) return
  const target = event.target as HTMLElement
  if (target.closest('.menu') || target.closest('[aria-haspopup="menu"]')) return
  closeMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('resize', closeMenu)
})
</script>

<template>
  <div v-if="menuOpen" ref="menuEl" class="menu" role="menu" :style="position">
    <button
      v-for="(item, i) in menuItems"
      :key="item.label"
      class="menu-item"
      type="button"
      role="menuitem"
      @click="choose(i)"
    >
      <span class="material-symbols-outlined">{{ item.icon }}</span>{{ item.label }}
    </button>
  </div>
</template>
