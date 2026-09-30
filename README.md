# Pulse Market

**Buy and sell within walking distance.**

Pulse Market is a neighbourhood marketplace. Someone two streets over lists a
desk they no longer want; you see it because it is genuinely near you, you save
it, you message them, and you pick it up. There is no shipping, no bidding, and
no scrolling past items on the other side of the country — everything in the
feed is close enough to carry home.

It is built for the Philippines. Signing up drops a pin on your neighbourhood,
and that pin is what the whole app is measured against: what is nearby, how far
away, whether a listing is worth the walk.

## What you can do

**Shop the neighbourhood.** The feed opens on what is around your pin. Distance
is measured, not decorated — haversine from your saved coordinates, so a listing
with no location says so rather than inventing a number. A map view shows the
same items as pins on OpenStreetMap, and each one can hand you a directions
link.

**Sell in seconds.** Snap or drop a photo, give it a title and a price, pick one
of eight categories (Furniture, Electronics, Home & Garden, Clothing & Kids,
Sports & Outdoors, Books & Media, Free & Giveaway, Other), drop a pin where
someone can collect it, and it is live. Photos go to Cloudinary; nothing is
stored on the API box.

**Run it from one dashboard.** Your listings with their status, the items you
saved, and the reviews you have received, plus four numbers that are actually
computed from your rows: active items, items sold, what you earned, and saves.

**Message without giving out your number.** Each listing gets one conversation
per buyer, stored server-side. A non-participant cannot read a thread or even
confirm that one exists — they get 404. Threads update live over the API's own
SSE stream and fall back to a 10-second poll, so a reply arrives whether or not
you refresh.

**Trade on trust.** Items move `active → reserved → sold`, and a sold item stays
visible with a badge and messaging switched off instead of vanishing. Once a
deal completes, each side rates the other — the seller by marking the item
sold, the buyer by reopening the thread. Your password is hashed by Supabase
Auth, and we never sell your data.

## How it keeps its numbers honest

- **There is no mock, seed or demo dataset anywhere in this repository.** Every
  value the UI renders comes from Postgres via the API, and a provider that is
  not configured makes the API refuse to boot rather than fall back to fixtures.
- **Nothing is fabricated.** No invented view counts, ratings or distances. If a
  number is not in the database, it is not in the UI.
- **The feed is narrowed in the database, not just on screen.** The API adds a
  bounding box around the viewer so the query uses a real index, then the client
  applies the exact radius. A "0 items nearby" means genuinely nothing nearby.
- **Public coordinates are approximate.** Unauthenticated listing reads round
  `lat`/`lng` to three decimals (~110 m), so nobody can scrape an exact pickup
  point for every seller in the city; the seller's own dashboard still gets the
  pin it stored, and distance filtering still runs on the exact column.
- **The API holds the service_role key, so RLS is not the authorization.** Route
  handlers do the real checks; the database policies are the second line.

## Stack

| Layer | |
| --- | --- |
| Front end | React 19, TypeScript, Vite, Tailwind 4, TanStack Query |
| Maps | Leaflet bundled from `node_modules`, OpenStreetMap tiles |
| API | Express on Bun (`:3000`) |
| Data & auth | Supabase — Postgres, Auth, no Supabase client in the browser |
| Images | Cloudinary (required in production) |
| Serving | nginx + Docker (`docker-compose.prod.yml`), nginx proxies `/api` |

## Run locally

Prerequisites: [Bun](https://bun.sh) 1.4+, a Supabase project (URL + service
role key), a Cloudinary account.

```bash
bun install

cp backend/.env.example backend/.env   # then fill in the real values
cp .env.example .env                   # nothing to fill in; see below

# Apply the schema once, in the Supabase SQL editor:
#   backend/supabase-schema.sql

bun run dev
```

`bun run dev` starts **both** processes: the API on `:3000` and Vite on `:5173`.
Running `bun run dev:web` alone starts only the front end, and every API call will
fail — the UI is not built to talk to anything but the API.

The front end calls same-origin `/api`, which Vite proxies to the backend, so there
is no CORS involved in development and no `VITE_API_URL` to configure. In
production the same `/api` path is proxied by nginx.

> The Vite HMR port is **24678**, deliberately not 3000. The API owns 3000; an HMR
> server on the same port silently swallows every API request and the failure looks
> like a CORS error rather than a port clash.

## Layout

```
src/                 React front end
  lib/api.ts         fetch wrapper, the only place that talks to the network
  lib/listing.ts     DB row -> UI shape
  lib/format.ts      timestamp, distance and peso formatting
  lib/geo.ts         haversine distance, Philippines bounds
  lib/realtime.ts    SSE reader (fetch-based, not EventSource)
  components/        UI - LandingPage, Feed, MapView, SellModal, ChatHub, Dashboard
  hooks/useQueries.ts React Query bindings
backend/             Express API
  src/server.ts      all routes
  src/schemas.ts     zod request validation - the source of truth for enums
  supabase-schema.sql  full schema, for a fresh database
  supabase-migrations/ incremental changes for an existing database
```

## Conventions worth knowing

- **Enums live in `backend/src/schemas.ts`.** The category and status vocabularies
  are duplicated in `src/lib/listing.ts` and `src/types.ts` for rendering. When you
  change one, change all three, and add a migration for the database CHECK
  constraint. They drifted apart once, and the API rejected most of what the UI
  offered.
- **Coordinates are real, and distance is measured, not faked.** `profiles` and
  `listings` both store `lat`/`lng` (migration `003`). Signup requires a pin inside
  the Philippines; `SellModal` requires one per listing. `App.tsx` computes the real
  haversine distance from the viewer's saved pin, so a listing with no coordinates
  renders "not available" rather than an invented number.
- **The feed is narrowed in the database, not just on screen.** The client sends its
  own `lat`/`lng`/`radius`, and `GET /api/listings` adds a bounding box around the
  viewer so the query uses `listings_lat_lng_idx`. This matters: the endpoint used to
  return the newest `limit` rows worldwide, so a city feed could show "0 items" while
  nearby items were simply outside the newest-N window. There is no PostGIS, so the
  box is larger than the circle and the client still applies the exact haversine cut.
- **A known distance is a claim worth checking.** "N items within R km" counts only
  listings whose distance is actually known. Unpinned listings stay in the feed
  (MapView points people here to find them) but are reported on their own line, so
  the total never includes a distance the database does not have.
- **Chat is stored server-side, and you cannot message yourself.** Conversations
  and messages live in `conversations` / `chat_messages` (migration `005`), replacing
  the earlier `messages` table, which was keyed only by `listing_id` and so could not
  tell a seller which buyer a message belonged to. A conversation is one thread per
  listing per buyer, unique on `(listing_id, buyer_id)`. Two guards prevent a
  self-thread: `conversations_distinct_participants` (`CHECK (buyer_id <> seller_id)`)
  in the database, and `assertCanStartConversation` in `backend/src/services/chat.ts`.
  This matters because a self-thread used to satisfy the review flow's
  `chat.sellerId === currentUser.id` check, letting an owner rate themselves. Routes:
  `GET /api/chats`, `POST /api/chats`, `GET|POST /api/chats/:id/messages`,
  `POST /api/chats/:id/read`. A non-participant gets 404, not 403, so conversation
  ids cannot be probed.
- **Messages are pushed when they can be and polled when they cannot.** The browser
  has no Supabase client, so there is no Supabase realtime subscription to ride.
  Instead `useRealtimeSync` holds an SSE stream on `/api/realtime` (topics
  `listings` and `chats`); a push carries no data, it only marks the relevant React
  Query caches stale, so the refetch goes back through the authenticated API with
  the viewer's radius and permissions applied — the same path a cold load takes.
  Polling stays underneath as the floor (`['chats']` every 10s, the feed every 15s)
  because the stream dies on a dropped connection or a buffering proxy and must
  degrade to polling, not to a frozen inbox. Events are coalesced for 400ms, so a
  seller marking an item reserved and then sold causes one refetch rather than two.
  The read path is `GET /api/chats` (all messages, grouped in memory), which is
  right at marketplace scale and should become a last-message-only query if a thread
  ever grows large. `/api/realtime` is exempt from the request limiter but capped at
  six concurrent streams per member.
- **Selling does not delete a listing.** `status` is `active`, `reserved`, `sold` or
  `archived`, and reads include everything except `archived`. Restricting reads to
  `active` meant marking something sold made it vanish — including from the seller's
  own dashboard, which derived "my listings" from the radius-filtered feed. Sold items
  render with a "Sold" badge, a greyed image, and messaging disabled. The dashboard gets
  its own `GET /api/me/listings`, not a filter over the feed, so a seller's items are
  unaffected by whatever radius the feed happens to be showing.
- **Only send columns the table has.** `createListingSchema` and `updateListingSchema`
  are `.strict()`, so extra keys are rejected. Fields like `condition` and
  `sellerRating` exist on the UI type as optional precisely because nothing stores
  them yet.

## Tests

```bash
bun run --cwd backend test    # API security + config boot-guard tests
bun run lint                  # tsc --noEmit
bun run scan:secrets          # no server-side secrets in the client bundle
```

## Deploying

`Dockerfile.dev` / `docker-compose.yml` for development containers,
`Dockerfile` / `docker-compose.prod.yml` for production, where nginx serves the
built front end and proxies `/api` to the API container:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Security headers are set once per response: helmet owns `/api`, nginx owns the
document and static files. `FRONTEND_URL` is pinned in the prod compose file so
the CORS allowlist never inherits the dev origin from `backend/.env`.
