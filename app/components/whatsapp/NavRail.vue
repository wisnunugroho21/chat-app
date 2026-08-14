<script setup lang="ts">
const { totalUnread } = useWhatsappStore()

const SECTIONS = [
  { label: 'Chats', icon: 'chat', current: true },
  { label: 'Status', icon: 'donut_large' },
  { label: 'Channels', icon: 'campaign' },
  { label: 'Communities', icon: 'groups' },
]
</script>

<template>
  <nav class="rail" aria-label="Sections">
    <button
      v-for="section in SECTIONS"
      :key="section.label"
      class="rail-item"
      :aria-current="section.current ? 'page' : undefined"
      :aria-label="section.label"
      :title="section.label"
    >
      <span class="material-symbols-outlined">{{ section.icon }}</span>
      <span class="rail-label">{{ section.label }}</span>
      <span
        v-if="section.current && totalUnread"
        class="rail-badge"
        style="display: block"
      >{{ totalUnread }}</span>
    </button>

    <div class="rail-spacer" />

    <button class="rail-item" aria-label="Settings" title="Settings">
      <span class="material-symbols-outlined">settings</span>
      <span class="rail-label">Settings</span>
    </button>
    <div class="rail-rule" />
    <div class="avatar a1" role="button" tabindex="0" aria-label="Your profile" title="Profile">
      NU
    </div>
  </nav>
</template>
