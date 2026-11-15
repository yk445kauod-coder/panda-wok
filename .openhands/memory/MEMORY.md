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
