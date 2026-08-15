// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  css: [
    '~/assets/css/nuxt-host.css',
    '~/assets/css/whatsapp.css',
  ],

  nitro: {
    // Serves server/routes/_ws.ts. Nitro's WebSocket support is still behind
    // this flag; without it the route 404s and the client sits on backoff.
    experimental: { websocket: true },
  },

  runtimeConfig: {
    // Service account for the FCM HTTP v1 API. Absent = push disabled, and
    // the socket carries everything on its own.
    fcm: {
      projectId: '',
      clientEmail: '',
      privateKey: '',
    },
    public: {
      // The Firebase web app config, plus the VAPID key from
      // Project settings → Cloud Messaging → Web Push certificates.
      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        messagingSenderId: '',
        appId: '',
        vapidKey: '',
      },
    },
  },

  app: {
    head: {
      title: 'WhatsApp',
      meta: [
        { name: 'theme-color', content: '#111b21' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block',
        },
      ],
    },
  },
})
