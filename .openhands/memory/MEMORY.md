# Project memory — panda-wok

> (Previous content here described a different project — "LAVA / azura-anime" — and was
> wrong for this repo. Replaced 2026-11-14 with panda-wok notes.)

## Stack & deploy
- Next.js + **OpenNext SSR on Cloudflare Workers via Pages** (`@opennextjs/cloudflare`),
  **Free plan = 10 ms CPU/request → Error 1102**. Supabase `xjbtsryidznsxqlynmfa` (eu-west-3, PG17).
- Repo `yk445kauod-coder/panda-wok`, live branch **`feature/panda-wok-platform`**.
- Pages project is **`panda-wok`** (not lava-project). Build `npm run pages:build` -> `.pages/`.
  Deploy: `node_modules/.bin/wrangler pages deploy .pages --project-name panda-wok
  --branch=feature/panda-wok-platform --commit-dirty=true` (env `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`). Production alias `panda-wok.pages.dev`.
- **Each deployment is a distinct origin** `<hash>.panda-wok.pages.dev`; cookies do not carry
  across deployments. `wrangler pages deployment tail` REFUSES this project — unusable.

## Console (admin) — the big one
- The console is **already a static SPA**: every `/admin/*` route is prerendered (in the build's
  prerender-manifest `routes`, none in `dynamicRoutes`). `/admin` serves `x-nextjs-prerender: 1,1`.
  Conversion = commits `da70e33` + `e53737a`; pattern/spec in `spa-conversion-spec.md`.
- So **the Worker does NOT SSR the console** — the remaining admin CPU cost is the
  `/api/admin/*` JSON endpoints + middleware. Cloudflare shows p50 ~11.8 ms, p99 ~575 ms
  (Nov 14) vs a 10 ms cap.
- **Error 1102 is architectural, not a code bug.** It cannot be fully removed on Free while
  dynamic `/api/admin/*` requests run on the Worker. Real fixes: Workers Paid ($5 -> 5 min CPU),
  or move the data layer off the Worker (e.g. Supabase directly from the browser).
- Middleware: admin requests skip `updateSession` (commit `1e98108`) — the console never reads
  the customer session (gate cookie auths it; `x-pw-path` elevates API reads to service role).
- Sign-out: `src/components/admin/admin-sign-out.tsx` -> `lockAdminAction` (clears gate cookie +
  minted Supabase session). Present in top bar / sidebar / mobile drawer.

## Admin auth model (hard-won)
- Two credentials, one field: shared **passcode** = owner; a staff **login_id** = that member's role.
- `mintStaffSession` gives the browser a real Supabase session for Realtime; `verifyOtp` type MUST
  be `magiclink` (matching `generateLink({type:"magiclink"})`) — `email` fails silently.
- Capability matrix in `src/lib/auth/rbac.ts` (`ADMIN_NAV` = 24 entries). `public.staff` is the
  team source (`/admin/users`).

## Analytics recipe (no wrangler needed)
- POST `https://api.cloudflare.com/client/v4/graphql`, Bearer `$CLOUDFLARE_API_TOKEN`.
  `pagesFunctionsInvocationsAdaptiveGroups` (Pages; dims `{date}`/`{datetimeHour}`),
  `workersInvocationsAdaptive` (Workers; dims `{scriptName,date}`, `cpuTimeP50/P99`).
  `requestPath`/`host` are NOT valid dimensions. `errors` column = 1102 CPU-cap failures.

## History (daily logs)
- `2026-11-13.md` — 1102 investigation, Intl formatter caches.
- `2026-11-14.md` — console heaviness (640 KB Supabase chunk lazy-loaded, double-ping debounce),
  request-volume measurements, staff-session fix, sign-out control, SPA-already-done proof.

## Pages advanced mode: static assets DO hit the Worker unless _routes.json excludes them (2026-11-14)
- **Root cause of "admin is heavy / multiple admins blow the request budget":** with a Pages
  advanced-mode `_worker.js`, *every* request invokes the worker — `/_next/static/*` chunks, fonts,
  images included. This project shipped no `_routes.json`, so one admin page load = ~35 static
  requests + HTML + session + page-data ≈ 38 invocations, all re-serving bytes the CDN answers free.
- **Proof method (reusable):** temporarily wrap `scripts/pages/_worker.js`'s export so every response
  carries `x-pw-worker: 1`, deploy, then `curl -sI <asset>` — the header on a static chunk means the
  worker ran. (Revert after.) A plain header diff is inconclusive because both paths return 200.
- **Fix:** `scripts/build-pages.mjs` writes `.pages/_routes.json` excluding only pure-asset trees:
  `/_next/static/*`, `/mascots/*`, `/fonts/*`. `_routes.json` DOES work in advanced mode (verified
  live: those paths return 200 with no worker header, routes still 200). Everything that can be a
  route (HTML, `/_next/image`, API, `/robots.txt`, `/sitemap.xml`) still reaches the worker.
  Caveat: `exclude` must not contain a `.`/`*` mid-segment; keep it to directory trees.
- Never add `/*.js` to `_headers` as immutable — it matches every HTML page and freezes them.

## Console request accounting (verified 2026-11-14)
- Per admin tab-open: 1 HTML (static) + 1 `/api/admin/session` + 1 page-data JSON + (was ~35 static).
- One shared poller for the whole tab (`src/lib/live/ops-sync.ts`): `60s` when the `ops-orders`
  broadcast is live, `8s` fallback. It dispatches `panda-wok:refresh`; pages re-read on that event.
- Gotcha: a page whose own `useAdminData` listens for `panda-wok:refresh` must NOT also pass a
  callback to `useOpsOrderSignal` — the store already dispatches the event on every ping, so a
  callback double-fetches. Kitchen board fixed this way.
