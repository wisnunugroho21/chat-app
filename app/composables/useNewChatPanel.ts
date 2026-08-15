import type { Contact } from '~/types/whatsapp'
import type { AuthUser } from '~/composables/useAuth'

/**
 * The "new chat" panel, and the people in it.
 *
 * The list used to be a hardcoded constant. It is now everyone who has
 * registered, fetched when the panel opens — so somebody who signed up a
 * minute ago is there without a reload.
 */

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
  const { me } = useIdentity()

  const directory = useState<Contact[]>('wa:directory', () => [])
  const loading = useState<boolean>('wa:directory-loading', () => false)
  const failed = useState<boolean>('wa:directory-failed', () => false)

  /** An account, as the picker shows it. The handle doubles as the subtitle. */
  const asContact = (user: AuthUser): Contact => ({
    id: user.id,
    name: user.name,
    about: `@${user.username}`,
    av: avatarTone(user.id),
  })

  async function loadDirectory() {
    loading.value = true
    failed.value = false
    try {
      const reply = await $fetch<{ users: AuthUser[] }>('/api/users')
      directory.value = reply.users.map(asContact)
    }
    catch {
      failed.value = true
      directory.value = []
    }
    finally {
      loading.value = false
    }
  }

  /** Belt and braces: the server already leaves us out of its own reply. */
  const others = computed(() => directory.value.filter(c => !sameName(c.name, me.value.name)))

  const results = computed(() => {
    const q = search.value.trim().toLowerCase()
    return others.value.filter(c =>
      c.name.toLowerCase().includes(q) || c.about.toLowerCase().includes(q),
    )
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
    if (loading.value) return 'Memuat kontak…'
    if (groupMode.value && selected.value.size)
      return `${selected.value.size} of ${others.value.length} selected`
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
    // Refreshed on every open: the point of a directory is that it is current.
    void loadDirectory()
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
      // Started from the directory, so we know exactly who this is — which is
      // what lets the first message arrive before they have any such room.
      peerId: contact.id,
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
      group: true,
      sub: `You, ${firstNames.join(', ')}`,
      preview: 'You created this group',
    })
    closePanel()
    store.openChat(name)
  }

  return {
    contacts: others,
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
    loading,
    failed,
    openPanel,
    closePanel,
    back,
    toggleContact,
    removeContact,
    pickContact,
    createGroup,
  }
}
