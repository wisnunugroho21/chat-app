<script setup lang="ts">
const auth = useAuth()
const route = useRoute()

useHead({ title: 'Sign in · WhatsApp' })

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

const canSubmit = computed(() => !!username.value.trim() && !!password.value && !busy.value)

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    await auth.login(username.value.trim(), password.value)
    // Back to wherever the guard interrupted, or the chat list.
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await navigateTo(next)
  }
  catch (cause) {
    error.value = authMessage(cause, 'Could not sign in. Try again.')
    password.value = ''
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <form class="auth-card" novalidate @submit.prevent="submit">
      <div class="auth-mark" aria-hidden="true">
        <span class="material-symbols-outlined">chat</span>
      </div>
      <h1 class="auth-title">Sign in</h1>
      <p class="auth-sub">Masuk untuk melanjutkan percakapan kamu.</p>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

      <label class="auth-field">
        <span>Username</span>
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        >
      </label>

      <label class="auth-field">
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="current-password" required>
      </label>

      <button class="auth-submit" type="submit" :disabled="!canSubmit">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>

      <p class="auth-alt">
        Belum punya akun?
        <NuxtLink to="/register">Daftar dulu</NuxtLink>
      </p>
    </form>
  </div>
</template>
