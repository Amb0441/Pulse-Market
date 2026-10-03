# Pulse Market

**Buy and sell within walking distance.**

Pulse Market is a neighbourhood marketplace for the Philippines. You drop a pin
on signup, and that pin is what the whole app is measured against: what is
nearby, how far away, whether a listing is worth the walk. There is no shipping,
no bidding, and no feed of items on the other side of the country.

Someone two streets over lists a desk they no longer want. You see it because it
is genuinely near you, you save it, you message them in-app, and you pick it up.

Live demo: [front end on Cloudflare Pages](https://pulse-market-eh1.pages.dev/)
with the [API on Render](https://pulse-market-api.onrender.com/api/health).
The first API request after idle can take ~30s (free-tier sleep).

## Features

- **Location-first feed** — listings are ranked and filtered by real haversine
  distance from your saved pin, not by “newest worldwide.”
- **Map view** — same items as pins on OpenStreetMap, with a directions link.
- **Sell in seconds** — photo, title, price, category, and a pickup pin. Photos
  go to Cloudinary; the API never stores image bytes.
- **Categories** — Furniture, Electronics, Home & Garden, Clothing & Kids,
  Sports & Outdoors, Books & Media, Free & Giveaway, Other.
- **Dashboard** — your listings (by status), saved items, reviews, and four
  numbers computed from real rows: active items, items sold, earnings, and saves.
- **In-app chat** — one conversation per listing per buyer. You never exchange
  phone numbers. Non-participants get 404, so thread IDs cannot be probed.
- **Live updates** — SSE from the API with a 10s poll fallback, so replies still
  arrive if a proxy drops the stream.
- **Listing lifecycle** — `active → reserved → sold` (or archived). Sold items
  stay visible with a badge and messaging off instead of vanishing.
- **Reviews** — after a sale, each side rates the other.
- **Auth** — email signup with a neighbourhood pin; passwords hashed by
  Supabase Auth. The browser never talks to Supabase directly.
- **Reports, settings, sharing, PWA** — report a listing, manage account
  settings, share a listing, install as a web app.

## What we built

Full-stack product, not a UI mock: every number on screen comes from Postgres
via our API. There is no seed or demo dataset in this repo.

**Architecture.** npm workspaces (`apps/web` + `apps/api`). React 19 + Vite SPA
talks to an Express API on Bun. Vite proxies `/api` in development. Production
is split: Cloudflare Pages (static UI) + Render (Docker API) so the showcase
stays on free tiers.

**Location is real.** Signup and selling both require a pin inside the
Philippines. The API boxes the query around the viewer so Postgres can use an
index; the client then applies the exact radius. Unpinned listings never invent
a distance. Public listing coordinates are rounded (~110 m) so pickup points
cannot be scraped to the doorstep.

**Chat and trust.** Threads live in `conversations` / `chat_messages` (one
buyer per listing). You cannot message yourself. Status changes do not delete
rows. The seller dashboard is its own endpoint, not a filter over the public
feed.

**Security posture (portfolio-grade).** Secrets live only in `apps/api/.env`
and the host dashboard — never in `VITE_` vars or git. The API holds
`service_role`; route handlers do authorization (RLS is a second line). CSP
and a service worker that does not intercept cross-origin API/CDN requests.
Helmet, CORS allowlist, rate limits. Not a pentest; not production-hardened
(free Render, optional `*.pages.dev` CORS for the demo).

**Deploy work.** Pages SPA fallback, CSP stamped with the API origin, lockfile
kept in sync for `npm ci`, Render health check and env wiring. Optional
same-origin Docker Compose remains for a single-host setup.

## Stack

| Layer | |
| --- | --- |
| Front end | React 19, TypeScript, Vite, Tailwind 4, TanStack Query |
| Maps | Leaflet (bundled), OpenStreetMap tiles |
| API | Express on Bun |
| Data & auth | Supabase (Postgres + Auth). No Supabase client in the browser |
| Images | Cloudinary |
| Hosting | Cloudflare Pages (UI) + Render (API). Optional Docker Compose |

## Run locally

Prerequisites: [Bun](https://bun.sh) 1.4+ (API runtime), Node 20.19+ or 22.12+,
a Supabase project (URL + service role key), a Cloudinary account.

Secrets go only in `apps/api/.env`. Do not put `SUPABASE_SERVICE_ROLE_KEY`, a
database URL, or `CLOUDINARY_API_SECRET` in a `VITE_` variable or in git.

```bash
# from the repo root
npm install

cp apps/api/.env.example apps/api/.env   # then fill in the real values

# Apply the schema once, in the Supabase SQL editor:
#   apps/api/supabase-schema.sql

npm run dev
```

`npm run dev` starts **both** processes: the API on `:3000` and Vite on `:5173`.
`npm run dev:web` alone starts only the front end; every API call will fail.

Locally the front end calls same-origin `/api` (Vite proxy). No `VITE_API_URL`
needed. Pages has no proxy: set `VITE_API_URL` at build time and list the Pages
origin in the API’s `FRONTEND_URL`.

> Vite HMR is on **24678**, not 3000. The API owns 3000.

## Layout

```
apps/web/              React front end
  src/lib/api.ts       fetch wrapper — only network entry
  src/lib/listing.ts   DB row → UI shape
  src/lib/geo.ts       haversine, Philippines bounds
  src/lib/realtime.ts  SSE reader
  src/components/      Landing, feed, map, sell, chat, dashboard
apps/api/              Express API
  src/server.ts        routes
  src/schemas.ts       zod — source of truth for enums
  supabase-schema.sql  full schema
  supabase-migrations/ incremental changes
```

Category and status enums live in `apps/api/src/schemas.ts` and are duplicated
in the web app for rendering. Change all three (API, web, DB CHECK) together.

## Tests

```bash
bun run --cwd apps/api test   # API security + config boot-guard tests
npm run lint                  # tsc --noEmit
npm run scan:secrets          # no server-side secrets in the client bundle
```

## Deploy

Showcase path: **Cloudflare Pages** (UI) + **Render** (API). Secrets stay in the
Render dashboard. Never commit `apps/api/.env`.

### 1. API on Render

New → Blueprint (reads `render.yaml`) or Web Service → Docker.
Dockerfile path `apps/api/Dockerfile`, context `.` (repo root). Instance **Free**.
Health check `/api/health`.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `ALLOW_CLOUDFLARE_PAGES` | `true` (demo previews) |
| `FRONTEND_URL` / `APP_URL` | Pages origin, no trailing slash |
| `CONTACT_EMAIL` | an email you read |
| `SUPABASE_URL` | project URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role only, never VITE_** |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | Cloudinary |

Do not set `PORT` (Render injects it). Confirm `/api/health` returns JSON.

### 2. UI on Cloudflare Pages

Connect the repo. Root directory `apps/web`, build `npm run build`, output
`dist`, Node `22`. Keep the **root** `package-lock.json` in sync (`npm install`
at the repo root) or `npm ci` fails.

| Variable | Public | Value |
| --- | --- | --- |
| `VITE_API_URL` | yes | Render origin, no path, no trailing slash |

No other `VITE_` keys. After the first Pages deploy, set Render
`FRONTEND_URL` / `APP_URL` to the `*.pages.dev` origin and restart the API.

`apps/web/public/_headers` and `_redirects` are copied into `dist/`. Changing
`VITE_API_URL` requires a new Pages deploy (CSP is stamped at build time).

### Local production stack (optional)

`docker-compose.prod.yml` builds nginx + API on one origin when you leave free
tiers.
