import type { MenuItem } from '~/types/whatsapp'

/**
 * The pieces that float above the layout: the kebab menu, the snackbar and
 * the screen-reader live region.
 *
 * These hold DOM nodes and timers, so they live in module scope rather than
 * `useState` — nothing here is ever touched while rendering on the server.
 */
const menuAnchor = shallowRef<HTMLElement | null>(null)
const menuItems = shallowRef<MenuItem[]>([])
const snackText = ref('')
const snackOpen = ref(false)
const announcement = ref('')

let snackTimer: ReturnType<typeof setTimeout> | null = null

export function useWhatsappOverlays() {
  const menuOpen = computed(() => !!menuAnchor.value)

  function closeMenu() {
    if (!menuAnchor.value) return
    menuAnchor.value.setAttribute('aria-expanded', 'false')
    menuAnchor.value = null
    menuItems.value = []
  }

  function openMenu(anchor: HTMLElement, items: MenuItem[]) {
    if (menuAnchor.value === anchor) {
      closeMenu() // second click on the same button closes it
      return
    }
    closeMenu()
    menuItems.value = items
    menuAnchor.value = anchor
    anchor.setAttribute('aria-expanded', 'true')
  }

  /** Close the menu and hand focus back to the button that opened it. */
  function dismissMenu() {
    const anchor = menuAnchor.value
    closeMenu()
    anchor?.focus({ preventScroll: true })
  }

  function say(text: string) {
    snackText.value = text
    snackOpen.value = true
    if (snackTimer) clearTimeout(snackTimer)
    snackTimer = setTimeout(() => (snackOpen.value = false), 1900)
  }

  /** Announce something that happened outside the user's focus. */
  function announce(text: string) {
    announcement.value = text
  }

  /* Spin the button while the "fetch" is in flight. This is where a real
     reload would await the server. */
  function busy(anchor: HTMLElement, run: () => void) {
    const icon = anchor.querySelector<HTMLElement>('.material-symbols-outlined')
    if (!icon) return run()

    const was = icon.textContent
    const button = anchor instanceof HTMLButtonElement ? anchor : null

    icon.textContent = 'progress_activity'
    icon.classList.add('spin')
    if (button) button.disabled = true

    setTimeout(() => {
      icon.textContent = was
      icon.classList.remove('spin')
      if (button) button.disabled = false
      run()
    }, 650)
  }

  return {
    menuAnchor,
    menuItems,
    menuOpen,
    openMenu,
    closeMenu,
    dismissMenu,
    snackText,
    snackOpen,
    say,
    announcement,
    announce,
    busy,
  }
}
