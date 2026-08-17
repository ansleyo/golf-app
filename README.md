# Golf Night

A Vercel-ready Next.js interface for your four-card Golf rules:

- 2–4 players and one standard deck
- Bottom two cards visible only to the current/local player
- Aces score 1, Kings score 0, every other card is face value
- On a turn, take draw/discard then swap or discard
- Each top card can be swapped once; it rotates sideways after that move
- The round ends immediately after the last draw card is played; cards reveal and scores are shown

## Run locally

Install Node.js 20.9 or later, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

Push this directory to GitHub and import the repository in Vercel. Its default Next.js settings work without changes.

## Multiplayer note

The current app is a fully playable shared-screen game UI. A room code is generated for the experience, but live cross-device state needs a realtime backend because Vercel serverless functions do not keep game connections open. Supabase Realtime is the recommended next addition: store each room's authoritative game state in Postgres, use a room channel to broadcast moves, and verify moves in a server-side route before writing them. This also prevents a player from seeing opponents’ face-down cards.
