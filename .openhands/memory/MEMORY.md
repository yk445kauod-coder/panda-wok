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
- **Error 1102 had fixable causes too, not just "architectural"** (corrected 2026-11-14, commit
  `9691c3f`). The big one: **zod was in the middleware bundle** — `env.ts` exported `publicEnv` and
  validated everything with zod, so ~450 KB of validator shipped on *every* request. Public values
  now live in dependency-free `src/lib/config/public-env.ts`. Verify with
  `grep -c ZodError .pages/middleware/handler.mjs` → must be 0.
  Remaining 1102 risk is genuinely architectural: dynamic `/api/admin/*` on Free's 10 ms cap.
  Real escalations: Workers Paid ($5 → 5 min CPU), or move the data layer off the Worker.
- **Live invocation data (2026-11-14):** `pages-worker--19831446-production` = panda-wok. Requests
  went 2,272/day (Nov 7) → 19,472/day (Nov 14) with **1,198 `errors` on Nov 13** (the `errors`
  column IS 1102). Always pull this before theorising about "heavy".
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
- **Fix:** `scripts/build-pages.mjs` writes `.pages/_routes.json` excluding pure-asset trees:
  `/_next/static/*`, `/mascots/*`, `/fonts/*`, **plus root-level `/favicon.ico`, `/icon-192.png`,
  `/icon-512.png`, `/manifest.webmanifest`, `/panda-logo.svg`, `/google*.html`** (added 2026-11-14 —
  a browser fetches several on every visit and each was a Worker invocation). `_routes.json` DOES
  work in advanced mode (verified live: those paths return 200 with no `cf-ray`, routes still 200).
  Everything that can be a route (HTML, `/_next/image`, API, `/robots.txt`, `/sitemap.xml`) still
  reaches the worker.
  Caveat: `exclude` must not contain a `.`/`*` mid-segment; keep it to directory trees.
- Never add `/*.js` to `_headers` as immutable — it matches every HTML page and freezes them.

## Console request accounting (verified 2026-11-14)
- Per admin tab-open: 1 HTML (static) + 1 `/api/admin/session` + 1 page-data JSON (static assets
  no longer invoke the worker at all).
- One shared poller for the whole tab (`src/lib/live/ops-sync.ts`): `60s` when the `ops-orders`
  broadcast is live, `8s` fallback. It dispatches **`panda-wok:live`** (changed from
  `panda-wok:refresh` in `9691c3f`); only pages that opt in via `useAdminData(p, q, {live:true})`
  re-read on that beat — orders-list, kitchen, dashboard, order-detail. A settings/exports tab now
  re-reads only after a mutation (`panda-wok:refresh`, still always fired).
- **Console first-load budget (verified live):** `/admin` = **237.5 KB gz** (was 331.0 → −28%).
  Charts go only through `src/components/charts/lazy.tsx`; only one dictionary per session.
  Measure: fetch `/admin` HTML, regex `/_next/static/chunks/*.js`, gzip each. **`curl` needs
  `-A "Mozilla/5.0"`** or Pages static assets return 403.
- Dead weight found but left in place: `src/lib/agent/repo-skills.generated.ts` (262 KB, **zero
  importers** — safe to delete with its `pre*` hooks), `useAdminPoll` (zero consumers).
- Gotcha: a page whose own `useAdminData` is subscribed to the live beat must NOT also pass a
  callback to `useOpsOrderSignal` — the store already dispatches the event on every ping, so a
  callback double-fetches. Kitchen board fixed this way.

## Supabase 402 outage + image egress (2026-11-13)
- **Symptom**: whole API 402 "exceed_cached_egress_quota" for *everyone*;
  `/en/menu` + `/en/cart` 500. Cause = Supabase-side org restriction (`free`
  plan, Cached Egress Exceeded), NOT code and NOT any edge function (there are
  none). Lifts at billing reset or on upgrade/spend-cap-off. `execute_sql` still
  works while REST/Storage 402 — use it to read state.
- **The number**: 24h edge egress = **1.17 GB from Storage (1,506 reqs)** vs
  47 KB from 40,094 REST reqs. Images were 99.99% of egress. Menu photos: 100
  objects / 83 MB, avg 848 KB. They were rendered **unoptimized** so every
  visitor hit `*.supabase.co` directly (Supabase counts it as egress even with
  CF cache 1341 HIT / 12 MISS).
- **Fix**: standalone Worker `panda-wok-media` (`workers/media-proxy/`, deploy
  with `wrangler deploy` from that dir) caches `menu-images` objects for a year.
  `src/lib/images/responsive.ts` rewrites Storage URLs to
  `https://panda-wok-media.yk445kauod.workers.dev/media/<name>`
  (`NEXT_PUBLIC_MEDIA_ORIGIN` override). Kept OFF the site Pages worker so image
  requests cost it no CPU. Commit 2704b13.
- Diagnostic recipe: `supabase_query_logs` with
  `sum(toInt64OrZero(log_attributes['response.headers.content_length']))` grouped
  by path/service — that is what exposed the images.

## panda-wok storefront resilience (2026-11-13)
- Supabase Free org can be **restricted** (`exceed_cached_egress_quota`) → every
  REST/Storage call 402 until billing reset. Every storefront page reads Supabase,
  so the whole site 500s. `execute_sql` still works — use it to rebuild seeds.
- Guard: `src/lib/cache/catalog-backup.ts` keeps a last-known-good copy per
  public read in `NEXT_INC_CACHE_KV`, plus a **bundled** seed
  (`src/lib/cache/seed/catalog-backup.ts`, generated, 227 entries) so `next build`
  succeeds with Supabase down. Net is attached to the fn passed to
  `unstable_cache`; `undefined` = no backup, `null` = a real answer.
- Never hand-write `*.supabase.co` image URLs in SEO/JSON-LD — use
  `dishImageUrl()` (routes through the `panda-wok-media` worker).
- `pages deploy --branch=feature/panda-wok-platform` deploys to **Production**
  for this project. Verify by re-fetching after the edge HTML TTL (~600 s).

## Console live signal — the ops hub (2026-11-13, commit `848c637`)
- The console's request blowout was **not** the poll: Supabase Realtime returns **402** on the
  restricted project, so `use-ops-signal` reported `live:false` forever and the shared poll never
  relaxed 8s → 60s. Fix = a signal that can arrive.
- Worker **`panda-wok-ops-hub`** (DO class `OpsHub`, instance `ops`)
  `https://panda-wok-ops-hub.yk445kauod.workers.dev`; WS `/?audience=console`, `/broadcast`, `/status`.
  Deploy: `cd workers/ops-hub && ../../node_modules/.bin/wrangler deploy`.
- **`/broadcast` is fail-closed** (`OPS_TOKEN` secret on the hub). It used to 200 an unauthenticated
  POST when the secret was unset — verified live; anyone could fake a kitchen alarm.
- **`OPS_TOKEN` must be set on BOTH hub and Pages, same value**, with `printf '%s'` (`echo` adds a
  newline → header never matches → 403). Console events carry **no ids** (the socket is public).
- **Pages project vars cannot be set from `wrangler.toml`/`wrangler.jsonc`** — ignored for Pages.
  Use `PATCH /accounts/<acc>/pages/projects/<proj>` → `deployment_configs.<env>.env_vars`.
  `OPS_HUB_URL` sat in wrangler.toml and was silently absent until set this way.
- **`DATA_BACKEND=d1`** is now set in `wrangler.jsonc` (the D1 shim owns `.from()`/`.rpc()` AND
  `auth.*`, so login works). The old "stays supabase / no `auth`" note is obsolete as of `a6939a7`.
- **Console invocation budget (measured 2026-11-13, commit `2f45747`)**: polling, not bundle size, is
  the cost (admin JS ≈ menu JS; only 4 pages poll). `OPS_POLL_FALLBACK_MS`=30s; a tick wakes boards
  only via `shouldWakeBoards` = `changed||forceBoards||!live` (idle live tick = 1 read, not 2).
  `/api/admin/crm` was a 500 — the four `crm_*` RPCs were Postgres-only; ported to `src/lib/d1/rpc.ts`
  (D1 `rpc()` is a plain promise — **no `.maybeSingle()`**). `pagesFunctionsInvocationsAdaptiveGroups`
  via GraphQL needs `--data @file` (inline nested filter → `unexpected EOF`).
- Most D1 feature tables are empty (58 tables; only `menu_items`=87, `announcements`=2 non-empty).
  `remove_unused_features` migration is Postgres-only and NOT applied to D1.
