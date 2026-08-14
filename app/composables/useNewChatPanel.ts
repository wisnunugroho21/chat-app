import { CONTACTS } from '~/data/contacts'
import type { Contact } from '~/types/whatsapp'

// Client-only panel state: closed on the server, so module scope is safe.
const open = ref(false)
const groupMode = ref(false)
const search = ref('')
const groupName = ref('')
const selected = ref(new Map<string, Contact>())
/** Bumped whenever the panel's search box should take focus. */
const focusTick = ref(0)

export const SLIDE_MS = 220

export function useNewChatPanel() {
  const store = useWhatsappStore()

  const results = computed(() => {
    const q = search.value.trim().toLowerCase()
    return CONTACTS.filter(c => c.name.toLowerCase().includes(q))
  })

  /** Contacts grouped under their initial letter, in list order. */
  const sections = computed(() => {
    const out: { letter: string, contacts: Contact[] }[] = []
    for (const contact of results.value) {
      const letter = contact.name[0]!.toUpperCase()
      const last = out[out.length - 1]
      if (last && last.letter === letter) last.contacts.push(contact)
      else out.push({ letter, contacts: [contact] })
    }
    return out
  })

  const title = computed(() => (groupMode.value ? 'New group' : 'New chat'))

  const subtitle = computed(() => {
    if (groupMode.value && selected.value.size)
      return `${selected.value.size} of ${CONTACTS.length} selected`
    return groupMode.value
      ? 'Add members, then name the group'
      : 'Pick someone to message'
  })

  function openPanel(group: boolean, carriedQuery = '') {
    groupMode.value = group
    selected.value = new Map()
    search.value = carriedQuery
    groupName.value = ''
    open.value = true
    focusTick.value++
  }

  function closePanel() {
    open.value = false
  }

  /** The back arrow steps out of group mode before it closes the panel. */
  function back() {
    if (groupMode.value) openPanel(false)
    else closePanel()
  }

  function toggleContact(contact: Contact) {
    const next = new Map(selected.value)
    if (next.has(contact.name)) next.delete(contact.name)
    else next.set(contact.name, contact)
    selected.value = next
  }

  function removeContact(name: string) {
    const next = new Map(selected.value)
    next.delete(name)
    selected.value = next
  }

  function pickContact(contact: Contact) {
    if (groupMode.value) {
      toggleContact(contact)
      return
    }
    store.ensureChat({
      name: contact.name,
      av: contact.av,
      sub: contact.about,
      preview: 'Draft',
    })
    closePanel()
    store.openChat(contact.name)
  }

  function createGroup() {
    if (!selected.value.size) return
    const members = [...selected.value.values()]
    const firstNames = members.map(m => m.name.split(' ')[0])
    const name = groupName.value.trim() || firstNames.slice(0, 3).join(', ')

    store.ensureChat({
      name,
      av: 'a2',
      group: true,
      sub: `You, ${firstNames.join(', ')}`,
      preview: 'You created this group',
    })
    closePanel()
    store.openChat(name)
  }

  return {
    contacts: CONTACTS,
    open,
    groupMode,
    search,
    groupName,
    selected,
    focusTick,
    results,
    sections,
    title,
    subtitle,
    openPanel,
    closePanel,
    back,
    toggleContact,
    removeContact,
    pickContact,
    createGroup,
  }
}
