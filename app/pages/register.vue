<script setup lang="ts">
const auth = useAuth()

useHead({ title: 'Create account · WhatsApp' })

const name = ref('')
const username = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

/** Mirrors the server's rule, so the obvious mistakes are caught before a
 *  round trip. The server still enforces it — this is only courtesy. */
const USERNAME = /^[a-z0-9._-]{3,32}$/

const mismatch = computed(() => !!confirm.value && confirm.value !== password.value)

const canSubmit = computed(() =>
  !!name.value.trim()
  && USERNAME.test(username.value.trim().toLowerCase())
  && password.value.length >= 8
  && !mismatch.value
  && !busy.value,
)

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    await auth.register({
      username: username.value.trim().toLowerCase(),
      name: name.value.trim(),
      password: password.value,
    })
    await navigateTo('/')
  }
  catch (cause) {
    error.value = authMessage(cause, 'Could not create the account. Try again.')
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
        <span class="material-symbols-outlined">person_add</span>
      </div>
      <h1 class="auth-title">Create account</h1>
      <p class="auth-sub">Nama tampilan kamu yang akan dilihat orang lain.</p>

      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>

      <label class="auth-field">
        <span>Display name</span>
        <input v-model="name" type="text" autocomplete="name" maxlength="64" required>
      </label>

      <label class="auth-field">
        <span>Username</span>
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          maxlength="32"
          required
        >
        <small>3–32 characters: letters, numbers, dot, dash or underscore.</small>
      </label>

      <label class="auth-field">
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="new-password" required>
        <small>At least 8 characters.</small>
      </label>

      <label class="auth-field">
        <span>Confirm password</span>
        <input v-model="confirm" type="password" autocomplete="new-password" required>
        <small v-if="mismatch" class="bad">Passwords do not match.</small>
      </label>

      <button class="auth-submit" type="submit" :disabled="!canSubmit">
        {{ busy ? 'Creating…' : 'Create account' }}
      </button>

      <p class="auth-alt">
        Sudah punya akun?
        <NuxtLink to="/login">Sign in</NuxtLink>
      </p>
    </form>
  </div>
</template>
