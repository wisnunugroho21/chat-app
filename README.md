# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Storage

Chats, messages, delivery receipts and push tokens are written to MongoDB, and
a booting tab pulls the conversation back from it. Copy `.env.example` to
`.env` and point it at a database:

```
NUXT_MONGODB_URI=mongodb://127.0.0.1:27017
NUXT_MONGODB_DB=chat-app
```

A local server is enough:

```bash
docker run -d -p 27017:27017 --name chat-mongo mongo:8
```

It is optional. With no URI the app keeps everything in memory and starts from
the seed data on every restart — the same way it behaves with no Firebase
service account, where push is off and the socket delivers on its own.

Three collections, created with their indexes on first connect:

| Collection | Holds |
| ---------- | ----- |
| `messages` | one document per message, keyed by its unique `wireId`, with delivery status |
| `rooms`    | one per conversation: participants seen, and the newest message for the chat list |
| `tokens`   | FCM registration tokens and the rooms each one listens to |

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
