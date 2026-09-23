<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Audit findings (2026-09-23, live project)

Verified against the live database, not just the code:

- **`staff` was empty, so `/admin` was unreachable for everyone.** Every admin RLS
  policy resolves through `current_staff_role()`, which reads `staff`. Nothing in the
  schema or seed ever created a row, so the whole admin/CRM surface was dead. Fixed by
  `20260923001000_bootstrap_staff_access.sql` (idempotent; promotes the founding
  account to `owner`). The row is now live. Promote other staff from the CRM — signup
  must never be able to grant a role.
- **The shared delivery pin never reached staff.** `place_order` stores
  `latitude`/`longitude` in `orders.address_snapshot`, but the admin order detail
  rendered only the text address, so "share my exact location" did nothing for the
  driver. The detail page now links to the pin in Maps.
- **Tenancy is currently inert.** `current_restaurant_id()` is
  `select id from restaurants where is_active order by created_at asc limit 1` — a
  hardcoded "first active restaurant", not session-derived. There is exactly 1
  restaurant and every `restaurant_id` is populated (0 rows missing across
  orders/profiles/menu_items/categories), so the tenant columns and the
  `*_restaurant` indexes do nothing today. Real multi-tenant isolation is a redesign,
  not a fix: it needs session/request-derived tenant resolution.
- **Do not revoke `EXECUTE` on `current_restaurant_id()`.** It is `SECURITY DEFINER`
  and used as the column default on 4 tables, so `EXECUTE` is checked for the
  inserting role; revoking from `anon` breaks anonymous inserts (verified: a bare
  `set role anon; select current_restaurant_id()` fails with 42501). The advisor
  warning about it is a false positive here. Same reasoning for `place_order`.
- **Leaked-password protection cannot be enabled** — Supabase gates
  HaveIBeenPwned checks behind Pro plans (API returns 402/plan message). Noted, not
  fixed.
- **i18n is genuinely complete.** `ar.ts` is typed as `Dictionary` from `en.ts`, so a
  missing Arabic key fails the build. Language switching is live-verified: the
  `panda-wok.locale` cookie flips `<html lang dir>` between `en/ltr` and `ar/rtl`.
  Gap: `AppError.message` from `@/lib/utils/errors` is English-only and is what the
  client renders for business errors, so error copy does not translate.
- **Auth:** anonymous sign-ins are now enabled on the project; email/password is
  still enabled because `staff`/admin login uses it (disabling it locks the owner out
  of `/admin` — verified). `profiles.email` is `citext` and nullable; placeholder
  phone emails are `panda-<last10digits>@phone.pandawok.app`.
- **Perf advisors:** 21 `multiple_permissive_policies` warnings are mostly the
  `_public_read` OR `_staff_write` pattern, which is intentional. 52 `unused_index`
  are INFO and reflect tiny tables, not a problem yet.
- **Deploy:** Cloudflare's Pages CI cannot build this repo (see note above).
  `.github/workflows/deploy-pages.yml` builds on a runner and runs
  `wrangler pages deploy .pages`. Needs repo secret `CLOUDFLARE_API_TOKEN`.

## Ops memory (2026-09-23)
> **Correction (2026-09-23, verified):** the earlier note below claiming Pages advanced
> mode "cannot serve static" was wrong. Pages advanced mode *does* expose a working
> `ASSETS` binding (proven with a diagnostic `_worker.js`: `hasAssets: true`,
> `ASSETS.fetch('/panda-logo.svg') -> 200`). What Pages does not do is serve that
> assets directory automatically the way Workers does — with a bare OpenNext
> `_worker.js` the HTML renders but every `/_next/static/*` request 404s. The fix is
> `scripts/pages/_worker.js`, a thin entrypoint that offers static-looking requests to
> `ASSETS` first and falls through to the OpenNext handler otherwise.
> `npm run pages:build` (OpenNext build + `scripts/build-pages.mjs`) assembles `.pages/`,
> which CLI-deploys cleanly. Verified live on https://panda-wok.pages.dev: SSR pages,
> middleware auth redirects, dynamic slugs, Supabase-rendered data, robots/sitemap/llms,
> opengraph image, Arabic RTL, and CSS/JS/assets all 200.
> Caveat: the Pages *CI* bundler still fails on `wrangler pages functions build` with
> "Could not resolve http/https/tty" even with `nodejs_compat` set in the dashboard —
> dashboard compatibility flags are not reaching the CI Functions bundler, so build via
> CLI (`npm run pages:deploy`) until that is resolved.

- ~~Live topology: https://panda-wok.pages.dev = **302 redirector** → canonical **Worker** https://panda-wok.yk445kauod.workers.dev~~ (superseded: `panda-wok.pages.dev` now serves the app directly over SSR with no redirect; `num_redirects=0` verified).
- Deploy worker: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` (wrangler.jsonc: main `.open-next/worker.js` + assets `.open-next/assets`+ AI binding).
- Worker alias: https://panda-wok.yk445kauod.workers.dev (from `opennextjs-cloudflare deploy`).
- Remote Supabase project: xjbtsryidznsxqlynmfa; tenancy migration applied remotely as `011_tenancy_fk_hardening` (local file: supabase/migrations/20260922001000_tenancy_fk.sql — same body, different version name — avoid double-`db push` of the same body).
- Pages project: static-only redirector site (`_redirects` `/* → worker` 302 + fallback `index.html`;no `_worker.js`). Secrets NEXT_PUBLIC_SUPABASE_URL/ANON, SUPABASE_URL, SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL set on Pages;the Worker's secrets live in its own env — keep both in sync.
- Auth: email optional at signup (phone-first;placeholder email `panda-<last10digits>@phone.pandawok.app`;auto-confirmed via service-role `admin.updateUserById(email_confirm: true)` when no real email;sign-in accepts phone too (maps to the placeholder);`/auth/forgot-password` = phone-or-email reset (route was missing → now created+live).
- Branding: settings keys `brand.logo_url` / `brand.favicon_url` / `brand.banner_url` (optional,is_public) — when set, footer/about/auth/OG render the uploaded logo via `BrandLogo`;fallback = `/icon.svg`(repo panda mark;file: `public/panda-logo.svg`). Admin sets via Settings → brand rows (generic string editor).

## Codebase map (2026-09-23)

- Customer app: src/app/(site)/* — home, menu, dish, cart, checkout, orders, tracking, account, loyalty, feedback, contact, about.
- i18n: ALL customer pages run through `src/lib/i18n/` — `dictionaries/en.ts` + `dictionaries/ar.ts` (single source of truth for strings), `server.ts` (`getLocale`/`getT`), `config.ts` (`Locale`), `translate.ts`, `catalog.ts`, `orders.ts`, `loyalty.ts` (`tierLabel`). RTL handled by `dir=rtl` on `<html>` + Tailwind logical props (`text-end`, `ms-`, `me-`, `start/end`). Server components call `getT(locale)`; client components use `useT()` from `i18n-provider`. Localised customer pages so far: menu, dish, cart, checkout, orders+detail, account+addresses, feedback, loyalty. Admin is intentionally English-only.
- Admin/CRM: src/app/admin/* — dashboard, orders, kitchen, users, CRM, segments, loyalty, feedback, broadcast, messages, AI centre, analytics, stock, upsell, menu CMS, settings, backups, exports. Guarded by src/middleware.ts (role-based), non-indexable.
- Auth: src/app/auth/* + supabase SSR session via src/lib/supabase/*
- Server actions = the API layer for mutations: src/lib/actions/* (there is NO src/lib/server-actions dir)
- Services: src/lib/services/catalog.ts (restaurant singleton, menu, slugs, flags), ai/ (assistant + provider chain + insights), crm/, services/orders.ts + services/order-workflow.ts. NOTE: README's src/lib/orders|backup|export|feedback|messages|broadcast|stock|loyalty dirs do NOT exist — the code is consolidated under src/lib/services, src/lib/crm, src/lib/ai.
- Schema: supabase/migrations/* — single source of truth; RLS in 007_rls_and_storage; tenancy FK in 011 (remote) / 20260922001000 (local).
- SEO/AEO: src/lib/seo/, src/app/robots.ts, sitemap.ts, llms-txt/route.ts; schema.org from live DB only.
- Deploy: wrangler.jsonc (opennext worker + AI binding), open-next.config.ts; next.config.ts (standalone, unoptimized images, llms.txt rewrite).

## Critical fixes (2026-09-23 session)
Two live-breaking defects on the remote project `xjbtsryidznsxqlynmfa` (both verified fixed + regression-tested via a rolled-back transaction):

1. **Signup and order placement were 100% broken.** Migration `011_tenancy_fk_hardening` added `restaurant_id` as `NOT NULL` to `profiles`/`orders`/`menu_items`/`categories` with **no default and no trigger**, while `handle_new_user()` and `place_order()` never set the column → every insert raised `null value in column "restaurant_id"`. Fix: `alter column restaurant_id set default public.current_restaurant_id()` on all four tables (migration `20260923000100_tenancy_defaults_and_hardening.sql`, applied remotely as `tenancy_defaults_and_hardening`).
2. **`orders_total_consistency_check` rejected every order.** The live constraint was `CHECK (total = round(subtotal - discount_total + delivery_fee + tax_total))` — single-arg `round()` truncates to an INTEGER, so any total with piastres failed. Fix: re-create with `round(..., 2)` (migration `20260923000300_orders_total_constraint_fix.sql`, applied as `orders_total_constraint_fix`).

Also applied: `20260923000200_rls_initplan.sql` (22 self-row policies rewritten as `(select auth.uid())`), pinned `search_path` on `touch_updated_at`/`order_is_editable`/`next_order_number`, and revoked `rls_auto_enable` execute from `anon`/`authenticated`.

**Migration drift — resolved.** The repo is now linked to the live project (`supabase link --project-ref xjbtsryidznsxqlynmfa`; config in `supabase/config.toml`). The remote `supabase_migrations.schema_migrations` history was reconciled to match the 13 files in `supabase/migrations/` (locally-only and remote-only entries were repaired to a single aligned list; no schema/data change). `supabase db push` is now a verified no-op.

Two further defects surfaced while reconciling:

3. **The ops RPCs were never actually applied to the live DB.** `20260922000700_ops.sql` was recorded as applied but `can_broadcast()`, `can_export()`, `can_backup()`, `segment_user_ids()`, `order_is_terminal()`, `send_broadcast()`, `create_export()` and `log_audit_event()` did not exist, so the Admin broadcast/export/backup screens were dead. Re-applied the file verbatim; all 34 locally-defined functions now exist live.
4. **The migration set could not replay from scratch.** `20260922000900_hardening.sql` backfilled `menu_items.availability_override`, a column that only ever existed in the live DB and was created by no migration. Wrapped the backfill in an `information_schema.columns` guard so a fresh `supabase db reset` succeeds.

`src/lib/types/database.ts` was regenerated against the live schema (`npm run db:types`). The hand-maintained copy had drifted: it was missing the tenancy columns/relationships and several RPC signatures while declaring six functions that did not exist live. Use the generated file from now on.

**Known remaining gaps:** no index covers the new `restaurant_id` FKs or many other FKs; tenancy is not enforced in any query (single-tenant assumption only); `pg_trgm` lives in `public`; `README.md` still lists non-existent module directories.

## Tenancy + security hardening (2026-09-23, session 2)
Migration `supabase/migrations/20260923001000_tenancy_rls_security_hardening.sql` was applied live (remote version name `tenancy_rls_security_hardening`). It closes the three gaps listed above:

1. **Tenancy is now enforced at the RLS layer** (task 1). Nine policies on `categories`, `menu_items`, `orders`, `profiles` gained `restaurant_id = public.current_restaurant_id()`. This makes the previously-unused `*_restaurant_idx` indexes load-bearing. Insert defaults were already fixed in `20260923000100`.
2. **28 unindexed FKs are covered** (task 2). Every `*_id` FK the performance advisor flagged now has a single-column index. Advisor count went 28 -> 0.
3. **SECURITY DEFINER surface shrunk:** `revoke execute` from `public` on the helper predicates, then re-granted only where honest (`current_restaurant_id()` -> anon+authenticated so public menu reads work; `is_staff`/`has_role`/`can_manage_*` -> authenticated). Internal-only helpers (`current_staff_role`, `is_admin`, `can_broadcast`, `can_export`, `can_backup`, `clawback_loyalty_on_failure`) now have no anon/authenticated EXECUTE. `pg_trgm` moved out of `public` into `extensions`.

Verified live: anon menu/category/restaurant reads still 200, `rpc/current_restaurant_id` still returns the tenant id, insert defaults resolve, and a rolled-back transaction confirmed the policies compile.

## Error coverage + dead code (2026-09-23, session 2)
- `toAppError` was blind to PostgREST errors: those are plain objects, not `instanceof Error`, so every raw `actionError(error)` collapsed to `UNKNOWN`. It now reads `.message`/`.code` off any error-shaped value, matches the full code token list, maps human sentences (`Not authorised to ...`, `A broadcast needs a ...`, `Unknown dataset`) and falls back to SQLSTATE (`42501` -> FORBIDDEN, `22023` -> VALIDATION).
- Removed dead exports: `errorMessage`, `messageForCode`, `getDictionaryForClient`, `touchLastSeenAction`, `listStockLinkOptions`, `alternateName`, `localiseItemDetail`, `segmentMemberIds`, `faqSchema`, `SkeletonText`, and the unused `ui/card.tsx` + `ui/dialog.tsx` components.
- `next build` + `tsc --noEmit` are green after these changes.

## Deployment topology (canonical, 2026-09-23)
- **Never redirect.** `panda-wok.pages.dev` must not be used as a 302 hop. The app is served by the **Worker** `panda-wok` (alias `panda-wok.yk445kauod.workers.dev`); a custom domain attaches to the Worker directly. There is no zone on this account, so the `workers.dev` alias is the canonical URL until one exists.
- The app Worker itself never redirects: the 307s on `/checkout` `/orders` `/loyalty` `/admin` are auth middleware, and `/<route>/` → `/<route>` 308 is Next's trailing-slash canonicalisation.
- Deploy: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`. `NEXT_PUBLIC_*` are **inlined at build time**, so export production values before building or the deployed bundle keeps whatever was in scope.
- Worker secrets (own env, set with `wrangler secret put`): `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `VAULT_TOKEN`, `AI_API_TOKEN`, `AI_CLOUDFLARE_API_KEY`, `AI_CLOUDFLARE_NAME`.
- `NEXT_PUBLIC_SITE_URL` must be the Worker URL (`https://panda-wok.yk445kauod.workers.dev`) — it drives canonical/OG/sitemap URLs, so `localhost` there leaks into production metadata.

### Pages CI is disabled on purpose (2026-09-23)
- The Pages project `panda-wok` is GitHub-connected (production branch `production`, preview on `*`), so **every push used to kick off a preview build that always failed**. Root cause: `src/app/api/analytics/route.ts` imports `src/lib/config/env.ts`, which throws at module load when `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are absent. Pages *preview* has `env_vars: null` and its *production* vars are present but **empty** (`secret_text` with `value: ""`), so the build died during "Collecting page data".
- The Pages build config is also structurally wrong for this app: `build_command: npx next build` with `destination_dir: out`, but `next.config.ts` uses `output: "standalone"` and Next never emits `out/`.
- **Fix applied:** `deployments_enabled: false` + `production_deployments_enabled: false` on the Pages project (via `PATCH /accounts/<id>/pages/projects/panda-wok` with `{"source":{"config":{...}}}` — the top-level form is silently ignored). Pages is only a redirector here, so it has no business building the Next app. Re-enable deliberately only if you also set the preview vars and a matching build config.
- The live `panda-wok.pages.dev` 302 → Worker is served by an older **ad-hoc production deployment from 11:39**, not by any current build. If it ever needs replacing, publish the redirector as static assets rather than re-enabling the Next build.

## Satellite workers (2026-09-23, session 2 — deployed)
- `workers/ai-api` → `https://panda-wok-ai-api.yk445kauod.workers.dev`. Bearer-guarded proxy over the account's Workers AI binding. Implements the exact `POST /ai/run/<model>` contract the app's `cloudflare` remote provider builds, so it is a drop-in base URL. `/health` is open; no token = 401. Default model `@cf/meta/llama-4-scout-17b-16e-instruct` (the previous `llama-3.1-8b-instruct` is deprecated — the binding errors if named).
- `workers/secrets-vault` → `https://panda-wok-secrets.yk445kauod.workers.dev`. Single server-side home for service keys. `GET /secrets/<NAME>` returns one allow-listed value behind a constant-time bearer check; there is deliberately **no bulk-dump route** (requesting `/secrets` is 404). `/health` reports configured names only, never values.
- Shared tokens live in `.agent_tmp/worker-tokens.env` (gitignored) — regenerate and re-`secret put` if lost; they are not recoverable from the workers.

## AI provider chain (2026-09-23, session 2 — live)
- The assistant's chain is **DB-driven**: `buildDbProviderChain` reads `ai_providers` rows; the env `buildProviderChain` is only a fallback path.
- Migration `20260923002000_ai_binding_provider.sql` adds row `workers-ai-binding` (`kind='cloudflare'`, `secret_ref=null`, `priority=10`) so the **keyless Workers AI binding** is the live primary. `resolveDbProvider` returns null when the binding is absent (plain `next dev`/`next build`), so the chain drops to the `deterministic` row at priority 900 and the assistant still answers without a key.
- Verified live: `ai_requests` logged `provider: "Workers AI"`, `model: llama-4-scout`, `status: ok`. Before this row existed every request logged `deterministic`/`fallback`.
- The AI worker's URL/model are wired on the app Worker as `AI_CLOUDFLARE_BASE_URL` / `AI_CLOUDFLARE_MODEL` vars (remote fallback), with `AI_CLOUDFLARE_API_KEY` holding the shared AI token.

## i18n (AR/EN) — verified live (2026-09-23, session 2)
- Both dictionaries are at parity: 481 keys each, no key missing from `ar.ts`. The switcher is mounted in `site-shell` (header + footer), `/account`, and `auth/layout`.
- Resolution order in `getLocale()`: explicit cookie (`panda-wok.locale`) → signed-in `profiles.locale` → `Accept-Language` → English.
- Verified on the **live Worker**: `Cookie: panda-wok.locale=ar` → `<html lang="ar" dir="rtl">`; default → `<html lang="en" dir="ltr">`; `Accept-Language: ar` → RTL. Arabic copy renders.
- **Deploy gotcha:** locale switching appeared broken until the Worker was rebuilt. The live bundle predated the i18n commit — always rebuild+redeploy after app changes, then re-test with the cookie before assuming a code bug.
