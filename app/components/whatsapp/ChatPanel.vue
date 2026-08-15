<script setup lang="ts">
const { currentChat } = useWhatsappStore()
</script>

<template>
  <main class="chat">
    <!-- Nothing is open until a conversation is picked, which is where a
         fresh account starts now that no chats are invented locally. -->
    <template v-if="currentChat">
      <WhatsappChatHeader />
      <WhatsappMessageThread />
      <WhatsappComposer />
    </template>

    <div v-else class="chat-idle">
      <span class="material-symbols-outlined">forum</span>
      <h2>Belum ada percakapan terbuka</h2>
      <p>Pilih chat di samping, atau mulai yang baru lewat tombol <b>New chat</b>.</p>
    </div>
  </main>
</template>
