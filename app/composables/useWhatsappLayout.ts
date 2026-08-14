/**
 * Which pane is on screen, plus the two media queries the rest of the UI
 * asks about. The listeners are attached once, by the page.
 */

// Client-only observations: never written during SSR, so module scope is safe.
const isNarrow = ref(false)
const prefersReducedMotion = ref(false)

let bound = false

export function useWhatsappLayout() {
  const pane = useState<'list' | 'chat'>('wa:pane', () => 'list')

  /** Attach the media-query listeners. Safe to call from several components. */
  function watchViewport() {
    if (bound || !import.meta.client) return
    bound = true

    const narrow = window.matchMedia('(max-width: 900px)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const syncNarrow = () => (isNarrow.value = narrow.matches)
    const syncMotion = () => (prefersReducedMotion.value = motion.matches)

    syncNarrow()
    syncMotion()
    narrow.addEventListener('change', syncNarrow)
    motion.addEventListener('change', syncMotion)
  }

  const showPane = (which: 'list' | 'chat') => (pane.value = which)

  // On the phone layout the nav sits at the bottom and steps aside once a
  // conversation is open; on a wide screen both panes stay side by side.
  const listVisible = computed(() => !isNarrow.value || pane.value === 'list')
  const chatVisible = computed(() => !isNarrow.value || pane.value === 'chat')
  const railHidden = computed(() => isNarrow.value && pane.value === 'chat')

  /** Duration to hand an animation, honouring the motion preference. */
  const motionMs = (ms: number) => (prefersReducedMotion.value ? 0 : ms)

  return {
    pane,
    isNarrow,
    prefersReducedMotion,
    listVisible,
    chatVisible,
    railHidden,
    showPane,
    watchViewport,
    motionMs,
  }
}
