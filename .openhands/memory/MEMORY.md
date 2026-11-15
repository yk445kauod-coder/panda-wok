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
- **Live invocation data:** `pagesFunctionsInvocationsAdaptiveGroups` on account 708d1cc2… is the
  authoritative metric. Requests 2,272/day (Nov 7) → **peak 23,682/day (Nov 13, 1,198 errors = 1102)**
  → 5,265/day (Nov 15) after the poll + shell fixes. Always pull this before theorising about "heavy".
- **The console *document* is now edge-cached (commit `a61edd7`, 2026-11-15).** `/admin/*` is a
  static, cookie-independent shell (`layout.tsx` reads no cookies/headers/DB; body identical with no
  cookie vs a bogus gate cookie; no `Set-Cookie`) but middleware pinned it `no-store`, so **every
  console navigation ran the Worker** to re-emit 14 KB. Fixed in `scripts/pages/{edge-cache,_worker}.js`:
  a *separate* `isAdminShellRequest` path caches only the document GET, keyed by build id
  (`adminShellCacheUrl`, build id inlined from `.pages/BUILD_ID` by `build-pages.mjs`; `s-maxage=300`,
  no SWR). The `/api/admin/*` **data** stays uncacheable — `isCacheableRequest`'s admin exclusion is
  untouched. Live: `/admin` → `cf-cache-status: HIT` (CDN answers, no Worker).
- **DO NOT remove Exports / Backups / Offers — they WORK on D1 (owner-confirmed 2026-11-15).**
  A prior commit removed Exports+Backups as "dead"; that was WRONG and was reverted (`78c877b`).
  Proof, run against real SQLite via `tests/helpers/sqlite-d1.ts`: `createExportJob` writes and
  completes a `ready` row; `buildBackup` yields a 567-byte bundle over 5 tables; `offers`
  insert/update/list all succeed. The 402s that looked like failure come from **Supabase REST being
  dead**, not from the features — with `DATA_BACKEND=d1` they never touch Supabase.
- **`DATA_BACKEND=d1` is set in the Pages PRODUCTION env only, not Preview.** So a deploy must use
  `--branch=feature/panda-wok-platform` (the project's production branch) or it lands as Preview
  with NO D1 and every admin action 402s. This is the trap that made the features look dead.
- `/dish-placeholder.svg` is excluded in `_routes.json` (build-pages.mjs) — the media-proxy 302s
  missing dish images there, so each was a Worker invocation serving one static file.
- **Empty-on-D1 tables are still product calls, NOT deletion candidates:** `faqs`, `page_content`,
  `feedback`. Never remove `delivery_zones`, the CRM, Offers, Exports or Backups.
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
  the cost (admin JS ≈ menu JS; only 4 pages poll). `OPS_POLL_FALLBACK_MS`=45s, live net 120s (+ a half-open-socket watchdog: heartbeat closes a socket silent > 60s, since `onclose` never fires for one); a tick wakes boards
  only via `shouldWakeBoards` = `changed||forceBoards||!live` (idle live tick = 1 read, not 2).
  `/api/admin/crm` was a 500 — the four `crm_*` RPCs were Postgres-only; ported to `src/lib/d1/rpc.ts`
  (D1 `rpc()` is a plain promise — **no `.maybeSingle()`**). `pagesFunctionsInvocationsAdaptiveGroups`
  via GraphQL needs `--data @file` (inline nested filter → `unexpected EOF`).
- Most D1 feature tables are empty (58 tables; only `menu_items`=87, `announcements`=2 non-empty).
  `remove_unused_features` migration is Postgres-only and NOT applied to D1.

## Dish photos are NOT lost — Supabase Storage egress quota 402s the whole project (2026-11-15)
- **Symptom**: every dish photo renders `dish-placeholder.svg`; `curl` on any
  `https://xjbtsryidznsxqlynmfa.supabase.co/storage/v1/object/public/menu-images/<name>`
  → **HTTP 402** `{"message":"...exceed_cached_egress_quota..."}`. `x-media-cache: UNAVAILABLE`
  from the media worker (its 402 branch redirects to the placeholder).
- **The objects are intact.** Verified via Supabase management API (SQL channel still works even
  while HTTP is 402'd): `storage.objects` bucket `menu-images` = **100 objects, 83 MB**; all **90**
  `menu_items.image_url` names match an object (**0 missing**), 0 items without an image. Nothing
  was deleted; only the *public egress endpoint* is gated on the Free plan.
- **402 hits EVERY HTTP path** (`/storage/...`, `/rest/v1`, `/auth/v1/health`, `/functions/v1`,
  HEAD, Range, both anon keys). Auth does not bypass it. `pg_net` inside the DB has internet but
  cannot reach internal service hostnames, so no server-side copy route exists.
- **Recovery**: enable R2 (dashboard only — API returns `10042 Please enable R2`), create bucket
  `panda-wok-media`, uncomment `r2_buckets` in `workers/media-proxy/wrangler.jsonc`, then
  `node scripts/migrate-media-to-r2.mjs` (copies objects to R2, prints the D1 URL-rewrite SQL).
  `uploadMenuImageAction` already prefers the R2 `MEDIA_BUCKET` binding. Alternatively the images
  reappear on their own when the quota resets, or immediately on a plan upgrade.
- **Media worker**: `workers/media-proxy` (`panda-wok-media.yk445kauod.workers.dev`), serves R2
  first then Supabase; `x-media-source: r2|…`, `x-media-cache: HIT|MISS|UNAVAILABLE`.
  Hero image is separate and fine: ImageKit `ik.imagekit.io/fpbwa3np7/…` (200).
- Offers/discount engine verified end-to-end: `tests/offers-scenarios.test.ts` (18 tests, all pass)
  drives real `place_order` on SQLite — percent/fixed, threshold, `max_discount` cap, best-offer,
  tie-break, disabled, per-customer targeting, preview↔stored agreement, tax-after-discount.
  Note the RPC reads settings `tax.rate`(0.14), `delivery.fee`(30), `delivery.free_over`(250),
  `ordering.min_order_total`(80) — tests neutralise them in `beforeEach`.
