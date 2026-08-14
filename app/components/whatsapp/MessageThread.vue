<script setup lang="ts">
import type { Message, ThreadEntry } from '~/types/whatsapp'

const store = useWhatsappStore()
const { current, currentChat, currentThread } = store

const scroller = ref<HTMLElement | null>(null)

/**
 * Turns the raw thread into the rows the template paints: day pills, the
 * encryption notice, bubbles with their grouping flags, and the typing
 * indicator pinned to the bottom.
 */
const entries = computed<ThreadEntry[]>(() => {
  const group = !!currentChat.value?.group
  const msgs = currentThread.value

  // Sender colours are assigned in order of appearance.
  const palette = ['s1', 's2', 's3']
  const colors = new Map<string, string>()
  const colorFor = (who: string) => {
    if (!colors.has(who)) colors.set(who, palette[colors.size % palette.length]!)
    return colors.get(who)!
  }

  const out: ThreadEntry[] = []
  let noticed = false
  let lastKey: string | null = null // drives bubble grouping and tails

  const notice = () => {
    if (noticed) return
    out.push({ key: 'notice', type: 'notice' })
    noticed = true
  }

  // Typing is transient presence, not history: render it after everything
  // else no matter where it sits in the array.
  const typing: Message[] = []

  for (const m of msgs) {
    if (m.kind === 'typing') {
      typing.push(m)
      continue
    }
    if (m.kind === 'day') {
      out.push({ key: `day-${m.id}`, type: 'day', label: m.label || '' })
      notice()
      lastKey = null
      continue
    }
    notice()
    if (m.kind === 'call') {
      out.push({ key: `call-${m.id}`, type: 'call', message: m })
      lastKey = null
      continue
    }

    const key = m.out ? 'out' : `in:${m.from || ''}`
    const first = key !== lastKey
    lastKey = key
    out.push({
      key: `msg-${m.id}`,
      type: 'bubble',
      message: m,
      first,
      showSender: group && !m.out && !!m.from && first,
      // Outgoing bubbles have no label, so they must not consume a colour
      // from the palette.
      senderClass: !m.out && m.from ? colorFor(m.from) : '',
    })
  }

  notice()
  if (!msgs.some(isMessage)) out.push({ key: 'empty', type: 'empty' })
  for (const m of typing) out.push({ key: `typing-${m.id}`, type: 'typing', message: m })

  return out
})

function scrollToBottom() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

// Follow the conversation: a new bubble, or a switch of chat, pins the view
// to the foot of the thread. A tick changing status does not.
watch(
  [current, () => currentThread.value.length],
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { immediate: true },
)

onMounted(scrollToBottom)
</script>

<template>
  <div ref="scroller" class="thread scroll">
    <template v-for="entry in entries" :key="entry.key">
      <div v-if="entry.type === 'day'" class="pill">
        {{ entry.label }}
      </div>

      <div v-else-if="entry.type === 'notice'" class="pill notice">
        Messages are end-to-end encrypted. No one outside this chat can read them.
      </div>

      <div
        v-else-if="entry.type === 'call'"
        class="pill call-log"
        :class="{ missed: entry.message.missed }"
      >
        <span class="material-symbols-outlined">{{ entry.message.icon || 'call' }}</span>
        {{ entry.message.text }} · {{ entry.message.time }}
      </div>

      <div v-else-if="entry.type === 'typing'" class="row in first">
        <div class="bubble">
          <div class="typing" :aria-label="`${entry.message.from || 'Someone'} is typing`">
            <i /><i /><i />
          </div>
        </div>
      </div>

      <div v-else-if="entry.type === 'empty'" class="empty-note">
        <span class="material-symbols-outlined">forum</span>
        <p>Belum ada pesan dengan <b>{{ current }}</b>. Tulis sesuatu di bawah untuk memulai.</p>
      </div>

      <WhatsappMessageBubble
        v-else
        :message="entry.message"
        :first="entry.first"
        :show-sender="entry.showSender"
        :sender-class="entry.senderClass"
      />
    </template>
  </div>
</template>
