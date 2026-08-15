// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  css: [
    '~/assets/css/nuxt-host.css',
    '~/assets/css/whatsapp.css',
    '~/assets/css/auth.css',
  ],

  nitro: {
    // Serves server/routes/_ws.ts. Nitro's WebSocket support is still behind
    // this flag; without it the route 404s and the client sits on backoff.
    experimental: { websocket: true },
  },

  runtimeConfig: {
    // Seals the session cookie. Must be 32+ characters; absent means a random
    // one per process, which works but signs everybody out on restart.
    session: {
      password: '',
    },

    // Where accounts, chats, messages and push tokens are stored. Absent =
    // memory only, so the app still runs — it just starts empty after every
    // restart, accounts included.
    mongodb: {
      uri: '',
      db: 'chat-app',
    },

    // Service account for the FCM HTTP v1 API. Absent = push disabled, and
    // the socket carries everything on its own.
    fcm: {
      projectId: '',
      clientEmail: '',
      privateKey: '',
    },
    public: {
      // How the two browsers in a call find each other. STUN is enough for
      // most networks — and for two tabs on one machine, nothing is needed at
      // all. A TURN relay is what gets a call through symmetric NAT.
      webrtc: {
        stunUrls: 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
        turnUrl: '',
        turnUsername: '',
        turnCredential: '',
      },

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
