# Project memory — panda-wok

> (Previous content here described a different project — "LAVA / azura-anime" — and was
> wrong for this repo. Replaced 2026-11-14 with panda-wok notes.)

## Console read cache — cache only header-free reads (2026-11-16)
- `src/lib/cache/admin-read.ts` → `cachedAdminRead` + one shared tag `ADMIN_READ_TAG="admin:reads"`
  (5s). Every admin write (`POST /api/admin/action`) `revalidateTag`s it. Applied to the CRM reads
  that use the **admin client**; dashboard aggregate shares the tag.
- **Never cache a read that uses `createServerSupabase()`** — `unstable_cache` runs its callback
  *outside the request scope*, so the `cookies()`/`headers()` read throws and the route 500s or
  returns empty (this broke `/api/admin/menu` + the staff roster). Guard: `tests/admin-read-cache.test.ts`.
- Dish/category detail pages are edge-cached (`s-maxage=60`, `x-edge-cache: HIT`); `isCacheablePath`
  is an exact match so un-purgeable keys are never stored.

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
- **The console must never poll via a Server Action (commit `581c5aa`, 2026-11-16).** A Next
  Server Action is a **POST back to the page the tab is on** — and every `/admin/*` route is a
  static shell, so it 404'd / re-ran the App Router / hit the 10 ms cap. The alert poll did this
  **4,028×/7d against 48 orders**, from every page × tab × admin: that was the reported "admin is
  heavy + requests exceed with more than one admin". Now `GET /api/admin/alerts` (gated
  `adminJson("orders.view")`). **Any console poll must be a `route.ts` GET, never an action.**
- **One page load = 2 requests, not 4 (commit `740b7e6`).** `/api/admin/session` already returns
  `pendingOrders`, so the store must be **seeded** from it (`seedOpsPending`, called in
  `AdminApp`) and `startPolling()` must read only `if (!store?.loaded)`. The seed **overwrites**
  (not early-returns) because after a lock the store holds the pre-lock list.
- Console weight (brotli): `/admin` 241 KB, `/admin/orders` 239 KB, `/admin/kitchen` 280 KB JS.
  The EN dictionary is 87 KB raw and **its `admin` block alone is 46 KB (53%)** — a separate
  admin dictionary is the next cut if first-load is still judged heavy.
- **Console dictionary split DONE (commits `5acbbaa` dict slice + `e3be062` session fast-path,
  2026-11-16).** The console renders only `common`/`errors`/`kds`/`admin`, now in
  `dictionaries/console-en.ts` / `console-ar.ts`; `en.ts`/`ar.ts` spread them back (`...consoleEn`)
  so keys keep one source. **Live `/admin` first-load 247,600 -> 238,548 br (-3.7%, -9.0 KB)** —
  smaller than hoped because the *admin* block itself is ~30 KB br; the win is evicting the **26.7 KB
  br Arabic** chunk + storefront blocks. `i18n-provider.tsx` no longer imports `en` by value (its
  outside-provider fallback used `dict: en`, and `useI18n().dict` has **no reader**). Guards:
  `tests/i18n-console-slice.test.ts`, plus `admin-weight-budget.test.ts` now rejects any
  `src/components/admin` file importing the full dict by value. Key count unchanged 630+1,174=1,804.
- `/api/admin/session` now checks the unlock cookie **before** reading settings (a locked browser —
  the passcode screen, every load + failed attempt — used to pay a full catalogue read for
  `{unlocked:false}`). Warm TTFB ~0.07s, cold ~0.6s.
- `wss://…ops-hub…?audience=console` **is live** (`hello`/`live:true`). Cadences:
  `OPS_POLL_FALLBACK_MS=60000`, `OPS_POLL_LIVE_MS=300000`.
- Console per-page JS is ~750–870 KB raw / ~240–280 KB brotli. Chart.js and the AR dictionary are
  **already lazy**; the 73 KB `24n5xcvyqk4g8.js` was the *English dictionary* chunk — removed from
  the console first-load by the `5acbbaa` split (the 26.7 KB br `24n5xcvyqk4g8.js` Arabic block was
  the one evicted from `/admin`; the English storefront blocks leave too).
- `@supabase/ssr`'s dynamic import in `supabase/middleware.ts` **does not shrink** the handler
  (~862 KB either way — Turbopack inlines it). It only avoids *constructing* the client on D1.
- **Always deploy with `--branch=feature/panda-wok-platform`.** That is the project's production
  branch (`production_branch` in the Pages API); `--branch=main` deploys a **Preview** that has no
  D1 binding and 402s every admin action.
- Cloudflare GraphQL: `clientRequestHTTPMethod` is **not** a valid dimension — group by
  `clientRequestPath` + `edgeResponseStatus` and infer the method.
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
- **Recovery (owner decision 2026-11-16: D1 only, no R2):** there is no R2 path any more —
  `scripts/migrate-media-to-r2.mjs` and the R2 binding were removed. To restore the trapped photos,
  unblock Supabase for one billing cycle (or upgrade), pull each `menu-images` object, and
  `putMediaObject()` it into D1's `media_objects`. The images also reappear on their own only if the
  Supabase quota resets **and** the URLs are pointed back at Supabase — which this deployment no
  longer does, so an explicit copy into D1 is the real fix.
- **Media worker**: `workers/media-proxy` (`panda-wok-media.yk445kauod.workers.dev`), reads **D1 only**
  (`media_objects`); `x-media-source: d1|missing` (missing = uncached placeholder redirect).
  Hero image is separate and fine: ImageKit `ik.imagekit.io/fpbwa3np7/…` (200).
- Offers/discount engine verified end-to-end: `tests/offers-scenarios.test.ts` (18 tests, all pass)
  drives real `place_order` on SQLite — percent/fixed, threshold, `max_discount` cap, best-offer,
  tie-break, disabled, per-customer targeting, preview↔stored agreement, tax-after-discount.
  Note the RPC reads settings `tax.rate`(0.14), `delivery.fee`(30), `delivery.free_over`(250),
  `ordering.min_order_total`(80) — tests neutralise them in `beforeEach`.

## panda-wok D1 admin console — verified wired (2026-11-15)
- D1 db `panda-wok` (id b093a40f-3ad7-498a-bad4-5abbfc4dfce5) holds **52 tables**; all 22 admin nav
  destinations covered. `node scripts/verify-d1-features.mjs` (needs CLOUDFLARE_API_TOKEN +
  CLOUDFLARE_ACCOUNT_ID) runs 19 feature probes with live joins -> **19/19 PASS**.
- D1 schema has **no FOREIGN KEYs** — relations are bare `*_id` columns (SQLite style). Verify joins
  by column, not by declared constraints. Real gotchas hit: `offers.is_enabled` (NOT is_active),
  `analytics_events.user_id` (no order_id), `agent_artifacts.run_id` (hangs off ops_agent_runs, NOT
  agent_threads), `agent_messages.thread_id`.
- `exports` and `backup_records` each carry a `content` (+`content_encoding`) column: the payload
  lives **in D1**, so Exports/Backups work with R2 disabled. R2 is paid -> not enabled.
- Menu photo: admin accepts a pasted URL (`menu_items.image_url`, works without R2) and falls back
  gracefully on upload failure; `menu_images` (storage_path|external_url) exists but is empty.
  **CORRECTION (2026-11-16): the pasted-URL path was silently broken** — see "Photo URL box" below.
- SQLite column introspection: `SELECT name FROM pragma_table_info('t')`.

## Supabase rescue: panda-wok (xjbtsryidznsxqlynmfa) — 2026-11-15
- **All Supabase HTTP endpoints 402** (`exceed_cached_egress_quota`): REST, Auth, Storage
  public/authenticated/signed, **S3 API**, and even Management API `/storage/buckets`. Only the
  Management **SQL** channel works: `POST https://api.supabase.com/v1/projects/<ref>/database/query`
  with `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` (token was in the MCP server process env).
  Direct PG (pooler 5432/6543) fails: `no tenant identifier`.
- Full DB rescued to `supabase-recovery/` (gitignored): 102 tables, 15 455 rows, 0 failures, plus
  schema.sql (DDL), data.sql, per-table JSON, key CSVs, storage/auth metadata, report, ZIP.
- **Storage bytes unreachable** (180 objects / 84.4 MB, menu-images 100/82.8 MB). Dish photos exist
  ONLY in Supabase Storage — not in git (scanned all blobs), not in .next/.open-next/.pages/.wrangler,
  and the CF media worker edge cache is UNAVAILABLE. Metadata catalogued; bytes are a hard gap.
- Archive hygiene: password hashes / tokens / vault secrets are redacted in the tree and the raw
  copies live in `supabase-recovery/sensitive/` (mode 700, excluded from the ZIP).

## Supabase -> D1 import (done 2026-11-15)
- **9385 rows / 41 tables merged into live D1** (`panda-wok`, id `b093a40f-…`), the DB the deployed
  Pages/Worker reads via its `D1_DB` binding. Merge = `INSERT OR IGNORE` on the PK: existing/D1-only
  rows survive, only missing rows added. Tools: `supabase-recovery/tools/import_to_d1.py` ->
  `d1-import/*.sql`, applied with `npx wrangler d1 execute panda-wok --remote --file=…`.
- Column-level conversion MUST mirror `src/lib/d1/coerce.ts`: bool->1/0, jsonb/array->JSON **text**,
  timestamptz->`…T…Z`. The JSON-column list is `JSON_COLUMNS` in `src/lib/d1/schema-meta.ts` — read it
  from the app so the two never drift. Writing a jsonb column (e.g. `settings.value`) as a bare string
  breaks reads: the shim `JSON.parse`s it.
- **Live D1 `settings` held 5 grouped blobs** (`brand`,`support`,`ordering`,`ai`,`marketing`) but the app
  reads **flat dotted keys** (`brand.name`,`ordering.accepting_orders`,…) via `.eq("is_public",true)`.
  So every setting was silently falling back to its default until the 35 flat rows were imported.
  Admin settings save path = `apply_settings_batch` RPC (updates existing keys only; never inserts).
- **Schema defect fixed:** `ai_usage_daily` is one row per **provider** per day but D1 declared
  `PRIMARY KEY (day)` -> 20 Supabase rows collapsed to 14. `migrations/0004_ai_usage_daily_pk.sql`
  rebuilds it as `(day, provider)`; `NATURAL_KEY.ai_usage_daily` in `src/lib/d1/client.ts` -> `"day,provider"`.
- D1 remote migration tracking (`d1_migrations`) was **empty** — the DB was provisioned out-of-band.
  `migrations apply --remote` then failed on `0003` (`duplicate column name: updated_by`). Fix: insert
  the already-effective `0003` row into `d1_migrations`, then apply. Keep this in mind before any
  future `wrangler d1 migrations apply --remote`.
- **Local `next dev` cannot test D1**: wrangler.jsonc vars don't reach `next dev`, so `DATA_BACKEND`
  is unset and it falls back to Supabase (402). To test the D1 path use the vitest harness
  (`tests/helpers/sqlite-d1.ts`, `node:sqlite`) or the deployed site.
- Verification: 41/41 tables >= export count, 0 orphans, 19/19 admin features, live pages 200,
  513 tests pass, tsc clean.
- **Pre-existing bug (NOT from the import):** `/en/menu/<unknown-slug>` -> **500** instead of 404
  (other routes 404 fine; the D1 shim returns null for unknown slugs). Data-independent.

## Console request-volume (already fixed by earlier sessions; verify before re-doing)
- The "admin heavy / worker requests exceed free plan" complaint was solved in `src/lib/live/ops-sync.ts`
  (+`visibility.ts`, `use-ops-signal.ts`, `ops-socket.ts`): **one** poll per tab, paused while hidden,
  adaptive cadence — `OPS_POLL_FALLBACK_MS=45000` (socket down) / `OPS_POLL_LIVE_MS=120000` (socket live).
  Confirmed present in the deployed bundle. Original measured pain: 23,682 invocations/day for one admin.
- **Account shares one free tier**: ~29 Workers + 10 Pages projects on account `708d1cc2…`. panda-wok
  itself is tiny (~58 req/day); the volume is other projects (lava-agent ~10k/week). Don't attribute
  account-wide limits to panda-wok.
- **Real regression the import created:** `getFunnel` (`src/lib/crm/customers.ts`) ran **5 unbounded
  `analytics_events` scans** deduped in the Worker. Fine at 55 rows, heavy at 7,133 (post-import).
  Fixed: `funnel_counts(p_days)` RPC in `src/lib/d1/rpc.ts` does it in one grouped query (D1 branch
  only; Supabase path unchanged). `analytics_events` is the only large table; activity/audit logs are
  bounded reads.
- `analytics_events.id` is an auto-assigned **INTEGER** (in `AUTO_ID_TABLE`); `orders` NOT NULL needs
  `idempotency_key`, `user_id`, `restaurant_id`, and `status` ∈ the CHECK list (use `finished`, not
  `completed`) when inserting test fixtures.

## Grep trap
- `src/lib/agent/repo-skills.generated.ts` is a huge generated file (embeds AGENTS.md). A repo-wide
  `grep -rn` that matches it floods the output. Exclude it: `grep -rn ... --include=*.ts | grep -v generated`.

## ⚠️ CORRECTION: Storage files were NOT rescued (2026-11-15)
- Previous session notes implied "everything imported". That is **false for Storage**.
  DB rows did move to D1 (verified: D1 `analytics_events` grows live, site shows imported phones).
  **Storage objects did NOT**: 0 of 180 downloaded. `supabase-recovery/reports/failed_downloads.txt`
  lists them; `manifests/storage_manifest.json` has metadata only.
- **100 dish images, 86.9 MB, are trapped** in Supabase Storage (`menu-images` bucket). Every access
  path returns 402 (`exceed_cached_egress_quota`): public, authenticated, signed-URL, S3, and the
  Management API storage endpoints. The **only** Supabase channel still open is the Management API
  **SQL** channel (`POST /v1/projects/<ref>/database/query` → 201) — but it can only read Postgres
  metadata, not object bytes. **No technical workaround exists.** The owner must unblock the project
  (remove spend cap / upgrade for one cycle), then re-run the pull.
- **R2 is NOT enabled** on the account (`GET /r2/buckets` → 10042 "Please enable R2 through the
  Cloudflare Dashboard"). So `workers/media-proxy` has **no MEDIA binding** and can only proxy
  Supabase → 402 → `302 /dish-placeholder.svg`. Verified: all 100 images probe as 302 placeholder.
  Every dish photo on the live site is broken right now. The old commit "store dish photos in R2"
  (30a3baa) never actually stored anything — R2 was never enabled.

## Worker-request crisis (measured, 2026-11-13)
- Account `708d1cc2…` hit **97,814 req on 2026-11-13** (free limit 100k/day); it was 34k on 11-08 —
  it tripled in 3 days. ~29 Workers + 10 Pages share the one budget.
- `panda-wok.pages.dev` is the **largest single source: 18,514 req/day**. Not 58 — that 58 is only
  `workersInvocationsAdaptive` for Worker *scripts*, which does **not** count Pages Functions.
- Culprits (11-13): `/admin/orders` 1,445 req with **cacheStatus=none** (admin pages effectively
  uncached; `/admin/orders` header is `public, max-age=0, s-maxage=300` yet 1,445/1,445 were `none`);
  2,224 of 3,286 `/_next/static` requests `cacheStatus=none`; **925 failed 5xx** — `/icon.svg` 377×504
  + `/apple-icon.png` 154×504 (Next-generated routes that are NOT static files, so `_routes.json`
  exclude can't help) and 258×503 `/admin/orders` (Free 10 ms CPU cold starts).
- The funnel fix (82ee831) removes only ~35k rows/load on the analytics page — a minor part of the
  request count. It was NOT the main cause of the quota crisis.

## Panda Wok — static shells kill Server Actions (2026-11-16)
- **Root cause of "menu upload broken / errors / slow":** every `/admin/*` page is a
  **static** shell (that's what keeps the Worker from rendering per page). A Next
  Server Action is a **POST back to the page it was declared on**; a static page
  answers only GET → **405 Method Not Allowed**. This silently broke **all ~46**
  console writes (upload, menu, categories, settings, offers, content), not just
  the upload. Verified live: `POST /admin/menu -> 405`.
- **Fix pattern (the house style here):** reads already went to `/api/admin/*`; writes
  now go to `POST /api/admin/action` via `src/lib/actions/dispatch.ts` (name→fn
  registry; unknown name = 404) + `src/lib/actions/client.ts` (browser shims that
  keep the SAME call shape, so a component only swaps its import path). Multipart
  body (`__name` + form fields, or `__args` JSON) so a File survives. Customer-side
  notifications + locale switch use `POST /api/session/action`.
- `x-pw-path` elevation already covers `/api/admin/*` (middleware `isAdminSurface`),
  so a new `/api/admin/*` route gets service-role reads with no extra wiring.
- Detail pages with a dynamic segment (`/admin/orders/[orderId]`, `/admin/crm/[userId]`)
  were the last Worker-rendered pages → converted to static shells `/admin/order?id=`
  and `/admin/customer?id=` (component reads `useSearchParams`). Now **0 admin pages
  server-render**; only `[id]/download/route` handlers stay dynamic (fine, they stream).
- **Guard test:** `tests/admin-action-dispatch.test.ts` asserts every action name the
  client uses exists in the server registry — keep it green when adding actions.
- Deploy: `npm run pages:build` then `wrangler pages deploy .pages --project-name=panda-wok
  --branch=feature/panda-wok-platform` with `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`
  (the token is NOT in `.env.local`; pass it explicitly). Local wrangler: `node_modules/.bin/wrangler`.
  **`--branch=main` is WRONG** — it deploys a *preview*, which gets no production env vars and no
  `D1_DB`, so `DATA_BACKEND=d1` is absent and every admin read 500s. (An earlier version of this
  very line said `main`; that instruction caused a real outage.) `package.json`'s `pages:deploy`
  and `.github/workflows/deploy-pages.yml` now both pin the production branch.

## Admin console: root cause of the 2026-11-16 outage + uploads moved to D1 (2026-11-16)
- **Why the whole console 500'd in production (09:40 deploy `4948643a`):** it was deployed to the
  **wrong Pages branch** and/or before commit `8398224` (11:02). Production at 09:40 still had the
  Server-Action era: `POST /api/admin/action` → 500, `POST /admin/menu` → 405, admin reads 403/500.
  The correct production deploy (`c34091b3`, 11:33, branch `feature/panda-wok-platform`) returned
  200 on unlock + every `/api/admin/*` read.
- **`getCloudflareBindings()` must never cache an empty resolution.** OpenNext calls
  `getCloudflareContext()` per request via AsyncLocalStorage, but a module can also be evaluated
  outside a request (build/SSG/prerender) where the call throws and yields `{}`. The old code
  memoised that `{}` for the isolate's lifetime, so `bindD1FromCloudflare()` saw no `D1_DB` on every
  later request → admin reads `read_failed` while public pages (re-bind per call) kept working.
  Fix: only remember a **non-empty** resolution.
- **Dish photos now live in D1, and D1 is the ONLY image store (owner decision, 2026-11-16).**
  There is no R2 (not enabled) and no Supabase (this deployment no longer depends on it at all),
  so the R2 and Supabase fallbacks were removed rather than left as dead code.
  `media_objects` table (`migrations/0005_media_objects.sql`, `src/lib/media/store.ts`).
  `uploadMenuImageAction` writes D1 and nothing else; a write failure is reported, never
  re-routed to a store that cannot work. Bytes are a BLOB (bound as `ArrayBuffer`), not base64.
  The media worker reads D1 only (`x-media-source: d1`) with a year-long Cache-Control; an object
  **not** in D1 returns an **uncached** `302 /dish-placeholder.svg` (`x-media-source: missing`) —
  that is what the **90 dish photos still trapped behind Supabase's 402** resolve to, because their
  legacy `menu_items.image_url` (all 90 rows still carry the `*.supabase.co/storage/v1/...` shape)
  is rewritten client-side to the worker host by `src/lib/images/responsive.ts`. Verified live:
  upload → served byte-for-byte, missing → placeholder, admin reads 200.
  **To actually recover those 90 photos**, the owner must unblock Supabase for one billing cycle,
  then pull each `menu-images` object and `putMediaObject()` it into D1.
- **Request volume is NOT the current problem.** Measured via `httpRequestsAdaptiveGroups` (the
  `clientRequestPath`-based account query works; `pagesFunctionsInvocationsAdaptiveGroups` needs the
  whole-account filter): account total ~2,388 requests over 15–16 Nov, admin API only ~1,063 over
  13–16 Nov (was 4,807 on the 14th before the poll fixes). The socket
  `wss://…ops-hub…?audience=console` is live (`hello`/`live:true`), so each tab polls at the
  300 s safety cadence, not the 60 s fallback. Console HTML `/admin` = 13,930 B raw / 3,303 B gzip,
  TTFB ~0.87 s (cold render; static shell is edge-cached after warm).
- **Admin nav ↔ features:** all 22 `ADMIN_NAV` destinations have a real `route.ts`; every client
  `/api/admin/*` reference resolves. No dead endpoint. The only disabled flag is `reservations`
  (intentionally off). Exports/Backups/Offers are in use — do not remove (see the standing warning).
- Account-wide worker usage (9–16 Nov) is dominated by **other** projects: lava-agent 19,610,
  lava-gateway 4,461, ignis-agent 2,216; panda-wok-media 1,698, panda-wok-ops-hub 119, panda-wok 71.
  Don't attribute the shared free tier's limits to panda-wok.

## Cache freshness — admin edits must reach customers (commit 614cd58, 2026-11-16)
An uploaded dish photo showed in the console but not the customer page. **Four** stale layers,
all needing fixing; the full write-up is in `2026-11-16.md`. Summary of the invariants:
- Console writes are `POST /api/admin/action`; **edge purge** keys on that path
  (`shouldPurgeAfter`), not `/admin`. If writes move again, update it or the purge dies silently.
- Customer routes live under `/[lang]/…`; always revalidate via **`revalidatePublicPath()`**
  (`src/lib/cache/revalidate.ts`), never a bare `revalidatePath("/menu/…")`.
- Prerendered pages (`generateStaticParams`) are **read-only assets** the KV incremental cache
  never rewrites → `revalidatePath` is a no-op on them. Put `export const revalidate = N` on any
  page an admin can change. `menu/[slug]` now does exactly this (no `generateStaticParams`).
- `isCacheablePath` must match **exactly** `PUBLIC_PATHS` (the purge can't enumerate sub-paths),
  else a cached `/menu/<slug>` is never cleared.
Quick triage: `x-nextjs-cache: HIT` + `s-maxage` on a URL = served from a stored copy;
`private, no-cache` = it reached the origin. Inspect
`.pages/server-functions/default/.next/prerender-manifest.json` to see which routes are frozen.

## Admin console invocations: `<Link>` prefetch is the multiplier (044f785, 2026-11-16)
Every `/admin/*` page is a **static shell** with client-side data, so a Next `<Link>` prefetch is a
real Worker invocation, not a client nav. The sidebar is in view at once, so one page load
prefetched every sibling route; the two "view site" links were `<Link href="/">` and `/`→`/en`, so
each tab also pulled the **whole customer site** (3 invocations, ~168 KB RSC). Measured `/admin/menu`:
6 prefetches/load → **42 reqs down to 25, 168 KB to 0** after setting `prefetch={false}` on all 47
admin `<Link>`s. **Rule: any new console link must set `prefetch={false}`** (test `admin-weight-budget`
enforces it). Don't reach for `<a href="/">` — `next lint`'s `no-html-link-for-pages` rejects it.
Prefetch regressions are silent (no console error); grep the tags to audit.
Also: `feature/panda-wok-platform` **is the Pages Production branch** — `wrangler pages deploy
--branch=feature/panda-wok-platform` ships straight to `panda-wok.pages.dev`. Redeploy with
`npm run pages:deploy`. And: the menu-item photo form uploads on *choose* but saves on *Save*; the
two are coupled by a form-level `uploading` flag in `form-kit.tsx` that blocks submit mid-upload.

## "Admin upload doesn't apply" was the slug (29ae95f, 2026-11-16)
`SlugField` (in `form-kit.tsx`) derived the slug on the *slug field's own* blur, but that field is
folded inside "More options" — so creating a dish never filled it and every save failed with
`fields.slug: "Too small: expected string to have >=2 characters"`. The photo was a red herring; the
same failure hits a dish with no photo. Editing looked fine because the slug was already stored. Now it
listens on the source name field's `input`, seeds on mount, stops once edited by hand.
**Live-test hygiene:** these tests write real D1 rows. `deleteMenuItemAction` is a SOFT delete
(`is_archived=1`), and uploads leave `media_objects` rows behind — so clean up with `wrangler d1 execute`
(DELETE), not the admin action, and record the row's previous value before you touch it. The seeded
catalogue has **no images at all** (`catalog-backup.json` → every `image_url` null), so `with_img` should
be 0.

## No substitute dish images (a981847, 2026-11-16)
Editing an existing dish + adding a photo already worked (`?edit=<id>` → `ImageUploadField` → Save →
D1); the slug bug (29ae95f) was create-only. Removed every stand-in image: deleted
`public/dish-placeholder.svg` (and its `_routes.json` exclusion in `scripts/build-pages.mjs`); the
media worker now `404`s a missing object instead of 302-ing to it; no-photo branches in `dish-card`,
`dish-detail`, `cart-view`, `editorial-sections`, `assistant-menu-cards` render an empty flat
`bg-rice-200` block instead of the asanoha weave + "Photo coming soon"; `common.photoSoon` dropped from
`console-en.ts`/`console-ar.ts`. `.asanoha` stays where it is decorative texture (not a photo stand-in).

## 1102 hardening: cache the public JSON, kill the mount-time action, back off the poll (2026-11-17)
The Free plan's 10 ms CPU cap (Error 1102) was still reachable after the page edge-cache work because
**three request shapes were outside it**. All three are fixed; nothing was turned off (SEO unaffected).

- **`/api/public/*` was never edge-cached.** `isCacheablePath` only matched locale-prefixed *pages*, so
  `/api/public/bootstrap` (≈121 KB, ~8 D1 reads) ran on the Worker on every page view — one page view =
  two invocations. `edge-cache.js` now has `isCacheableApiPath` / `isCacheableApiRequest` /
  `toApiCacheUrl` + `apiCacheKeys`, caching `/api/public/bootstrap`, `/api/public/content` and
  `/api/public/menu/<slug>`. **Key includes the query string** (the locale lives there), so locales can't
  collide. `_worker.js` grew an API branch (JSON-only store, `isJson`). Never cached: `/api/public/me/*`
  (per-customer), `/api/analytics` (a write), any request with a session or `panda-wok.admin` cookie.
- **The header bell called a Server Action on mount.** `ViewerProvider` (in `[lang]/layout.tsx`, i.e.
  every customer page) ran `loadMyNotificationsAction()` in a `useEffect` → a POST back to a *static
  shell* → the App Router re-emits the document. Replaced by `GET /api/public/me/notifications`
  (`src/app/api/public/me/notifications/route.ts`, `cache-control: no-store`); the action was deleted.
  `tests/static-shell-actions.test.ts` fails if any customer-shell client component calls an
  `@/lib/actions/*` binding inside a `useEffect` (user-initiated form actions are fine and stay).
- **Polling is now error-adaptive.** `startVisiblePoll` (`src/lib/live/visibility.ts`) takes an optional
  `PollOptions` and a tick that may return `false` on failure: the interval backs off ×2 (jittered ±25 %,
  capped at 12×base / 30 min) while the origin fails and resets on success. `readPending` in `ops-sync.ts`
  now returns a boolean so the console poll backs off; a 401/403 returns `true` (a deliberate lock, not a
  failure). A `void` tick is treated as success, so the plain pollers keep their exact prior cadence.
  `tests/live-visibility.test.ts` pins the growth, the cap, the reset and the foreground reset.

**Latent security bug found and fixed while here:** `edge-cache.js` decided "is this a signed-in
visitor?" with `name.startsWith("sb-") && includes("-auth-token")` — the *Supabase* cookie name. The app
issues a **D1** session cookie `pw-auth-token`, which that never matched, so a signed-in visitor was
treated as anonymous and their page could be stored under a public key. Now `isSessionCookie` matches
both shapes; `isAdminCookie` matches `panda-wok.admin`.

**Also:** `warm-edge-cache.mjs` (`npm run pages:warm`) now warms `/api/public/bootstrap` and
`/api/public/content` per locale after the documents, so a fresh deploy isn't cold for the JSON either.
`apiCacheKeys` can only enumerate the two fixed paths — `/api/public/menu/<slug>` clears by TTL, same as
the dish HTML page (safe: `place_order` validates modifiers server-side).

State: typecheck clean, lint 0 errors (8 pre-existing `no-img-element` warnings), **504 passed / 18
skipped**, `next build` green.

## CRM customer list paginated, with server-side sort (2026-11-17)
The CRM home was the one genuinely unbounded flat admin list (`listCrmCustomers({limit:100})`, no offset).
It is now paged at `DEFAULT_PAGE_SIZE` (25) like orders/feedback/users, with a `Pagination` control.

**The sort had to move server-side.** The page used to sort the 100 rows in the browser; that is only
correct while every row is on screen. With 25 rows per page a client-side sort would reorder just those
25 and read as if the whole book were sorted. So `crm_customers` gained a 4th arg `p_sort`
(`recent | lifetime_value | orders | at_risk`, unknown → `recent`):
- Postgres: `supabase/migrations/20261117000100_crm_customers_sort.sql` — re-creates the function with a
  `case`-based `order by` so no dynamic SQL is built from the argument (an unknown value cannot reach an
  unindexed ordering). **Not applied to the live project yet** — the D1 path is what runs in production
  (`DATA_BACKEND=d1`), and the D1 shim carries the same change in `src/lib/d1/rpc.ts` (`crmCustomers`).
- D1 shim: the in-memory sort now switches on `p_sort` before the `slice(offset, limit)`.
- `listCrmCustomers` takes `sort?: CrmSort`; the route validates against a whitelist and defaults to
  `lifetime_value` (the page's previous default); the page dropped its client sort and reads `sort`
  straight from the URL into the fetch.
`tests/d1-crm-sort.test.ts` (5) pins each ordering and the unknown-value fallback against real SQLite.
Note the D1 test schema needs `order_number` + `idempotency_key` on an `orders` insert (both NOT NULL).

State: typecheck clean, lint 0 errors (8 pre-existing warnings), **509 passed / 18 skipped**, build green.

## Dish pages were the last cold-render 1102 surface (2026-11-17)
`/[lang]/menu/[slug]` was `force-static` but had **no `generateStaticParams`**, so none of its
~90 slugs × 2 locales were built. The route is a constant spinner shell (the slug only reaches the
client via the RSC router params), yet each URL was a **cold on-demand render** the first time anyone
opened it — and a cold render is exactly what exceeds the Free plan's 10 ms CPU ceiling. Proven with a
concurrent burst: `error code: 1102` on `new-style-philadelphia-4-pieces` while sibling slugs answered
200. The slug is embedded in the RSC payload (`[\"\",\"en\",\"menu\",\"meal-1\"]`), so one shared cache
key per locale would be wrong — the fix is to build the shells, not to alias their keys.

Fix: `generateStaticParams` on the dish page returns every category + item slug × locale, read from
`getMenuSlugs()` (the bundled last-known-good catalogue, so a restricted DB cannot fail the build; a
try/catch returns `[]` and the page still renders on demand). `next build` now prerenders **212** slug
paths and they ship as `cdn-cgi/_next_cache/<build>/<locale>/menu/<slug>.cache` (106 per locale) — the
static-assets incremental cache, read with no KV and no Worker render.

Also extended `scripts/warm-edge-cache.mjs` to walk dish pages after the fixed set, discovering slugs
from the already-warmed `/api/public/bootstrap` (no extra origin read). **Warm sequentially with a
pause** — a tight concurrent warm itself triggers 1102 (`503`/`500` on the same cold slugs). Bounded to
`DISH_WARM_LIMIT = 400`.

Verified live after deploy: all 174 dish URLs (87 × 2) answered 200 under a single concurrent burst, the
60-request mixed public burst was 60/200, `/admin` 8/200, and dish HTML is `x-edge-cache: HIT` with
`s-maxage=600`. `next build` green, typecheck clean, 509 passed / 18 skipped, lint 0 errors.

## Dish shells served as static files — CI warm is green again (12a69ed, 2026-11-17)
The **last** Error 1102 surface was `/menu/<slug>`, and the failing variant was **Arabic only**.
CI warm run `44183125349` failed with 297 failures — **all** `ar /menu/<slug>` (0 en) — 184 × 500,
113 × 503; Cloudflare analytics showed 120 `exceededResources` in the deploy window. Every other
public page (`/`, `/menu`, `/about`, `/contact`, `/faq`, `/location`, `/privacy-policy`, `/cart`) and
every English dish page warmed fine. The page is a static client shell (0 SSR data reads in the body),
but a **cold edge-cache miss** made OpenNext read + JSON-parse the ~539 KB AR cache entry (vs 435 KB EN;
Arabic is 2 UTF-8 bytes/char, so the `/_full` RSC segment is 116,977 B vs 91,120 B) and rebuild the App
Router tree — over the Free plan's 10 ms CPU cap.
**Fix:** ship each dish/category shell as a real `.html` file and serve it from `ASSETS`, so a cold
request is one file read, not a Next render.
- `scripts/build-pages.mjs` `writeStaticShells()` walks the copied incremental cache and writes the
  `html` field of every `/menu/<slug>` entry to `.pages/<lang>/menu/<slug>.html` (the exact failing
  surface; also guaranteed data-free). 212 shells.
- `scripts/pages/_worker.js` `renderOrigin()` offers the `.html` to `ASSETS` **before** calling Next,
  and `applyDocumentHeaders()` restates the CSP + frame headers (the shell bypasses middleware). Only
  an anonymous document nav is eligible — a session cookie, RSC, prefetch, Authorization or a
  markdown-for-agents accept still reaches Next.
- `scripts/warm-edge-cache.mjs`: **dropped the ~212-URL dish walk.** It was 20+ min of CI time
  protecting pages that are now static, and one cold start failed the whole step.
**Verified:** CI run `44190180808` = **success** (warm green for the first time). Live: 174/174 cold
original dish burst = 200 on a fresh deploy, 87/87 AR on production, 0 `exceededResources`; served
bytes **byte-identical** to the static file; the page hydrates and renders the dish + its option
groups (browser-checked); RSC 307 + markdown behaviour unchanged. `tests/static-dish-shells.test.ts`
(5) pins the wiring. 514 passed / 18 skipped, typecheck clean, lint 0 errors.
**Rule:** a static shell still costs a *cold Next render* on a cache miss. A route whose shell is
constant should be written as a real file at build time, not left for OpenNext to reconstruct. When
only one locale fails, suspect payload size (RTL/Arabic is the bigger one), not the route logic.
**Polling/pagination audit (already done, no change needed):** every admin list that grows paginates
(`orders`/`crm`/`users`/`feedback` via `resolvePage` + `DEFAULT_PAGE_SIZE`, `Pagination` in
`components/ui/pagination.tsx`); CRM commit `44177991115` = success. Polling is one shared timer
(`lib/live/ops-sync.ts`, 60 s fallback / 300 s when the socket is live, visibility-paused, `live` flag
opt-in per board) — not per-consumer. Only the menu CMS fetches a fixed 400 (bounded, exhaustive-read
by design), and `offers`/`crm/activity`/`crm/[userId]` are bounded pickers.

## IDOR: the customer tracking read was unscoped (a9acf1b, 2026-11-18)
`getOrderForViewer(orderId)` in `src/lib/services/orders.ts` filtered on the row id alone. The
D1 backend has **no row-level security**, so any signed-in customer could read any order — with the
owner's delivery name, phone and address — by supplying its id. Reached from
`GET /api/public/me/orders/[orderId]`; the route's comment claiming "RLS is the boundary" was the
false assumption. Confirmed with a real SQLite test (BOB read ALICE's order), not by reading code.
Fixed by taking `viewerId` and adding `.eq("user_id", viewerId)`; a foreign order returns null,
matching the policy it replaces. `tests/order-viewer-scope.test.ts` (4) pins owner-gets-it,
other-gets-null, unknown-id-null, and no child (items/history) leak.

**The rule to keep: on D1, every read of an owner-scoped table must carry its own ownership filter.**
The shim resolves `userId` for *writes* only (`stampActor`); SELECTs get no automatic predicate.
An audit of all customer paths found exactly this one leak — `getMyOrders`, `getMyAddresses`,
`getMyStats`, `getMyFeedback`, and every address/feedback action already filter by `user_id`
correctly. Admin reads (`admin-orders.ts`, `admin-catalog.ts`, `actions/admin.ts`) are exempt: they
run elevated because `x-pw-path` starts with `/admin` or `/api/admin`.

## `changed_by_role` is NULL because the actors are not staff rows (2026-11-18)
Not a trigger bug. `log_order_status` (migrations/0002_triggers.sql) fills `changed_by_role` from
`(SELECT role FROM staff WHERE user_id = NEW.updated_by)`, and `updated_by` is stamped by the D1
shim from the acting identity. Every actor that has changed an order status lives in `auth_users` /
`profiles` but **not** in `staff` — including the founding owner `yk445kauod@gmail.com`
(`bae2e99a…`), who drives the console with the shared passcode. So the subquery finds no row and the
role is NULL. The console renders it conditionally (`order-detail.tsx:328`), so nothing breaks —
the role label is simply omitted. To populate it, the acting account needs a matching `staff` row;
the passcode owner path attributes to the first active owner staff row (`resolveActorId` in
`src/lib/auth/session.ts`), so the staff table's owners must be the accounts actually working.
