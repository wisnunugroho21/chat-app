# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Accounts

Sign in at `/login`, or create an account at `/register`. Everything else is
behind that: a signed-out visitor is redirected before any chat markup is
rendered, and the history and push endpoints refuse them outright.

Passwords are hashed with scrypt from `node:crypto` — memory-hard, in the
standard library, no native build step — and only ever stored as a digest and
its salt. The session is a sealed, HTTP-only cookie signed with
`NUXT_SESSION_PASSWORD`; the server keeps no session table, so a restart does
not sign anyone out.

The WebSocket authenticates too, which is the part worth knowing about. A
socket cannot read the session cookie the way an endpoint can, and the first
frame used to simply *claim* an identity — meaning anyone could have typed
someone else's name. Now the browser spends its session on
`POST /api/realtime/ticket`, gets a single-use token valid for a minute, and
the socket presents that instead. The server resolves the account behind it and
stamps every message with that identity, so a client cannot assert who it is.

> **Testing with two people.** `?as=Name` is gone — a real session belongs to a
> browser profile, so two tabs are now one account. Use a second browser or a
> private window for the other side.

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
the seed data on every restart — accounts included, so you would register again
each time. The same way it behaves with no Firebase service account, where push
is off and the socket delivers on its own.

Three collections, created with their indexes on first connect:

| Collection | Holds |
| ---------- | ----- |
| `users`    | one account: public id, unique handle, display name, scrypt salt and digest |
| `messages` | one document per message, keyed by its unique `wireId`, with delivery status |
| `calls`    | one per finished call, keyed by `callId`: who placed it, how it ended, how long it ran |
| `rooms`    | one per conversation: participants seen, and the newest message for the chat list |
| `tokens`   | FCM registration tokens and the rooms each one listens to |

Call logs are written by the server, from the signalling that already passes
through it — one `end` frame is sent per call, so there is one record per call
however many browsers were involved. The record keeps the facts rather than a
sentence, because the same unanswered call reads "Unanswered" to whoever placed
it and "Missed" to whoever did not; each browser composes its own wording when
the history loads.

## Calling

Voice and video calls are real WebRTC: the audio and video go straight from
one browser to the other, and the server only carries the handshake. That
handshake rides the same WebSocket as the messages — `invite`, `ring`,
`accept`, `ice`, `end` — so there is nothing extra to run.

Try it with two tabs, the same way you would try messaging:

```
http://localhost:3000/?as=Rina    http://localhost:3000/?as=Budi
```

Open the same conversation in both, press the voice or video button in one,
and pick up in the other. An invite rings every device in the conversation;
whoever answers first gets the call, and the rest are told it was answered
elsewhere.

Between tabs on one machine nothing needs configuring. Across networks, the
default public STUN servers cover most cases — a network behind symmetric NAT
needs a TURN relay, which is what `NUXT_PUBLIC_WEBRTC_TURN_URL` is for.
Browsers only grant a camera or microphone on a secure origin, so `localhost`
works, but a phone on your LAN needs HTTPS.

The ringer in the sidebar is still a simulation: it opens the call screen with
no peer behind it, which is useful for looking at the UI on its own.

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
