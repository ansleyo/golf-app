# Card Night

A Vercel-ready Next.js interface for two card games:

- **Golf:** 2–4 players and one standard deck
- Bottom two cards visible only to the current/local player
- Aces score 1, Kings score 0, every other card is face value
- On a turn, take draw/discard then swap or discard; a card picked up from discard cannot be immediately re-discarded
- Each top card can be swapped once; it rotates sideways after that move
- The round ends after the last draw card is placed or discarded; cards reveal and scores are shown
- **Phase 10:** 2–4 players, a standard 108-card deck, colored cards, Wild cards, and Skip cards
- Phase 10 deck composition: 8 copies of each number (1–12), 8 Wild cards, and 4 Skip cards
- Complete the ten standard phases in order: two sets of 3; set of 3 plus run of 4; set of 4 plus run of 4; runs of 7, 8, and 9; two sets of 4; seven cards of one color; set of 5 plus set of 2; set of 5 plus run of 3
- Draw, discard, lay down a phase with compatible extra cards, hit existing melds, use Skip cards, and score cards remaining in hand

## Run locally

Install Node.js 20.9 or later, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

Push this directory to GitHub and import the repository in Vercel. Its default Next.js settings work without changes.

## Azure deployment

The Next.js client uses `NEXT_PUBLIC_API_URL` to call the Azure Functions room API. The API stores authoritative room state in Azure Database for PostgreSQL and exposes `GET`, `POST`, and `PUT` routes under `/api/rooms/{code}`. The client polls the room API every two seconds so it does not require database credentials or direct database access in the browser.

Configure these API settings in the Azure Function App:

```text
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_DATABASE
POSTGRES_USER
POSTGRES_PASSWORD
```

Configure `NEXT_PUBLIC_API_URL` in the frontend deployment, for example `https://<function-app>.azurewebsites.net/api`. Room codes use `GOLF-XXXX` or `PHASE-XXXX`; the game prefix is fixed in the join form.
