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
  `wrangler pages deploy .pages`. It needs **two** repository secrets:
  `CLOUDFLARE_API_TOKEN` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable
  key; not sensitive, it ships in the browser bundle). With the anon key absent
  the build fails while collecting config for `/api/analytics`, the deploy step
  is skipped, and the live site silently keeps the previous deployment.
  `panda-wok.pages.dev` currently serves 200 directly (no redirector) for `/`,
  `/menu`, `/about`, `/contact`, `/cart`, `/auth/sign-in`, `/robots.txt`,
  `/sitemap.xml`, `/llms-txt`.

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

## Audit pass (2026-09-23, session 3)

### Live topology correction
- `panda-wok.pages.dev` now serves the app **directly** (`/` and `/menu` -> 200, no `Location`). The older "302 redirector -> Worker" note above is obsolete; the Pages project serves the OpenNext `.pages` output. `deploy-pages.yml` is the active path (`node-version: 22`, `pages deploy .pages --branch=production`).

### Verified healthy (no change needed)
- **Tenancy:** `restaurant_id` on `categories`/`menu_items`/`orders`/`profiles` carries `default current_restaurant_id()`, so inserts satisfy the NOT NULL from 011. All 21 migrations are applied remotely; `supabase db push` is a no-op.
- **RLS:** policies are role-scoped and tenant-scoped (`anon` only ever reaches `*_public_read` rows such as `categories_public_read`, `restaurants_public_read`, `settings_public_read`); owner/staff policies are `authenticated`-only. The advisor's "anonymous access policies" warnings are the expected `{anon,authenticated}` public-read rows, not leaks.
- **Error codes:** all 21 `AppErrorCode` members are translated in both `en.ts` and `ar.ts`.
- **Security definers:** `current_restaurant_id`, `is_staff`, `has_role`, `place_order` are intentionally `SECURITY DEFINER` and each pins `search_path = public`; `rls_auto_enable` is revoked from `public/anon/authenticated`.

### i18n switcher bug (fixed)
- The switcher wrote the cookie but the page kept the old language until a manual reload: `revalidatePath("/", "layout")` clears only the **server** cache, while the client **Router Cache** still held the previous locale's payload. `language-switcher.tsx` now calls `router.refresh()` after the action.
- Confirmed per-request SSR: `Cookie: panda-wok.locale=ar` -> `<html lang="ar" dir="rtl">` on the first byte; responses are `cache-control: private, no-cache, no-store` and RSC requests are cookie-keyed (no ISR/edge caching of locale).

### Dead code removed
- `src/lib/ai/provider.ts`: `buildProviderChain`, `buildEnvFallbacks`, `buildRemoteFromEnv`, `REMOTE_PROVIDER_KINDS`, `isProviderKind` - unreachable since the chain became DB-driven (`buildDbProviderChain`). `getAiProviderUsage` stays (called by `QuotaEnforcedProvider`).
- Also removed: `CategoryHeading`, `slugify`, `getMyDefaultAddress`, `getMyNotifications` (no callers).

### Still open (advisor, judgement calls - not applied)
- `auth_otp_long_expiry`, `auth_leaked_password_protection` (dashboard toggles).
- 40 `unused_index` + 21 `multiple_permissive_policies` performance warnings.
- `anon` can still `EXECUTE public.current_restaurant_id()`; harmless (reads one active restaurant id) but revocable if the linter must be clean.

### CI failure - diagnosed and half-fixed (2026-09-23, session 3)

The build log pasted after the session-3 push was **Cloudflare's own Git-connected Pages CI**, not the GitHub Actions workflow. Both were broken, for different reasons.

**1. Cloudflare Pages Git integration (was re-enabled by mistake).**
- `source.config.deployments_enabled` / `production_deployments_enabled` were back to `true`, so every push kicked off preview builds again.
- Both envs pin `NODE_VERSION=20`; the CI builder ships **wrangler 3.114.17**, which mishandles `nodejs_compat` and fails to resolve `async_hooks`/`fs`/`path`/`crypto`/... against `compatibility_date 2026-09-01`. This is the failure in the pasted log.
- Re-disabled via `PATCH /accounts/<id>/pages/projects/panda-wok` with `{"source":{"config":{"deployments_enabled":false,"production_deployments_enabled":false}}}`, which **worked** (both now `false`; verify after any dashboard edit - the toggle silently reverts).
- Nuance not previously recorded: disabling the toggles does *not* delete the Git connection. A push can still surface a failed *associated* build in the dashboard. The authoritative fix is to disconnect the repo from the Pages project entirely (Workers & Pages -> panda-wok -> Settings -> Build -> disconnect Git).

**2. GitHub Actions `Deploy Pages` (the intended path) was failing on every run.**
- Real cause: the `NEXT_PUBLIC_SUPABASE_ANON_KEY` repository secret was **never set**. It resolved to empty, `src/lib/config/env.ts` threw at module load, config collection for `/api/analytics` aborted, and the deploy step was skipped. Production only ever moved because deploys were run by hand (`npx wrangler pages deploy`).
- Fixed by falling back to the Supabase **publishable** key in the workflow env (`${{ secrets.X || '<publishable>' }}`). That key is public by design - it already ships in the browser bundle - so this leaks nothing; a real repository secret of the same name still takes precedence.
- Verified the next run gets **past the build** (`Worker saved in .open-next/worker.js`).
- **Still failing at the deploy step:** `CLOUDFLARE_API_TOKEN` is also unset as a repository secret. `wrangler pages deploy` aborts with "In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable".
- **Action needed by an account owner** (no API token here has `secrets: write`; `gh secret set` returns 403): set the repository secret `CLOUDFLARE_API_TOKEN` (Workers/Pages edit) at https://github.com/yk445kauod-coder/panda-wok/settings/secrets/actions , and optionally `CLOUDFLARE_ACCOUNT_ID` as a repository variable.

### CI failure - ROOT CAUSE FOUND AND FIXED (2026-09-23, session 4)

The pasted log was **Cloudflare's Git-connected Pages CI** (bundled wrangler
`3.114.17`). It failed inside `wrangler pages functions build` with 14
`Could not resolve "<node builtin>"` errors (`async_hooks`, `fs`, `path`, `os`,
`crypto`, `url`, `vm`, `util`, `buffer`, `stream`, `module`, `http`, `https`,
`tty`) followed by `Top-level await is not available ... ("ES2017")`.

Both are reproducible locally with `npx wrangler@3.114.17` (the CI's version),
and each had a distinct cause:

1. **The Pages bundler never saw `nodejs_compat`.** It does not read the
   Workers-style `wrangler.jsonc` - it prints *"Found wrangler.json file ...
   does not appear to be valid ... contains the `pages_build_output_dir`
   property. Skipping file and continuing."* and then resolves the `_worker.js`
   against defaults, so the 14 bare Node builtins are unresolvable. Fix: a
   **`wrangler.toml`** with `pages_build_output_dir = ".pages"` plus
   `compatibility_date` / `compatibility_flags = ["nodejs_compat", ...]`. This
   removes all 14 errors. `wrangler.jsonc` stays the source of truth for the
   Worker path; the two coexist (verified `wrangler deploy --dry-run` still
   reads the JSONC: AI binding + vars + `.open-next/assets`).
   (Putting `pages_build_output_dir` in the JSONC instead is **wrong**: wrangler
   then treats the Worker config as a Pages project and `wrangler deploy` fails
   with *"The name 'ASSETS' is reserved in Pages projects"*.)

2. **`tsconfig.json` target `ES2017` rejected OpenNext's top-level `await`.**
   The middleware bundle OpenNext emits uses top-level await; esbuild honours the
   tsconfig `target`, which `ES2017` cannot represent. Fix: `target: "ES2022"`.
   `next build` + `tsc --noEmit` stay green.

Verified end to end: `npm run pages:build` then the exact CI command
(`wrangler@3.114.17 pages deploy .pages`) completes with "Uploading Worker
bundle / Deployment complete" (previously "Build failed with 14 errors / Failed
building Pages Functions"). Production `https://panda-wok.pages.dev` was
redeployed from `2689e43`; `/`, `/menu`, `/_next/static/*` and `/robots.txt` all
return 200.

**GitHub Actions `Deploy Pages` is still blocked by one missing secret.** Its
build step is green; the deploy step needs a repository secret
**`CLOUDFLARE_API_TOKEN`** (Workers/Pages edit). `gh secret set` returns 403 with
the integration token available here, so an account owner must set it at
https://github.com/yk445kauod-coder/panda-wok/settings/secrets/actions
(optionally `CLOUDFLARE_ACCOUNT_ID` as a repo variable).

## Auth failure root cause + fix (2026-09-23, session 5)

A first-time customer (`madrasty61@gmail.com`, phone `01277593815`) could not
sign up and then could not sign in with the same credentials; the UI showed
"Something went wrong". Verified live, not just in code:

- **Root cause: duplicate identity, not config or transport.** The phone
  `01277593815` is already owned by profile `f7504be6-9c0d-474e-8ad7-75c2675980d0`
  (the owner account). `handle_new_user()` does a plain `insert ... on conflict
  (id) do nothing` into `profiles`, so the *unique* `profiles_phone_key` was hit,
  the trigger raised 23505, and Supabase aborted the whole `auth.users` insert —
  a 500 the UI could only render as `UNKNOWN`. `signInWithPassword` then failed
  because no auth user had ever been created for that email/phone. Reproduced in
  a rolled-back transaction: `insert into profiles (...) values (…, '01277593815', …)`
  → `23505 duplicate key value violates unique constraint "profiles_phone_key"`.
- **The live constraints are only on `profiles`**: `profiles_pkey (id)` plus a
  unique `profiles_phone_key` and `profiles_email_key` (not listed by a
  `pg_constraint` scan for `contype in ('u','p')` because they are unique
  *indexes*; query `pg_indexes`/`information_schema`, not just `pg_constraint`).
  Phone is stored in three shapes across history (`01277593815` legacy,
  `+201…` canonical), so any duplicate lookup must match all of them.
- **Live auth config (Management API `/config/auth`)**: `mailer_autoconfirm=false`,
  no custom SMTP (`smtp_host=null`), `rate_limit_email_sent=2` per hour,
  `external_email_enabled=true`, `external_phone_enabled=false`,
  `external_anonymous_users_enabled=true`. Meaning: an emailed confirmation is
  *not* dependable (no SMTP, 2/hour project-wide) — every customer supplying an
  email would be either stranded at a confirmation wall or would exhaust the
  quota and fail signups for everyone. `external_phone_enabled=false` also means
  the derived placeholder **email** identifier is unavoidable.
- **Fix (code, no schema change needed):** all signups now go through the
  service-role admin API (`auth.admin.createUser({ email_confirm: true })`) and
  are signed in immediately, so nothing depends on the mailer. A pre-flight
  profile lookup across every stored phone shape returns a specific
  `PHONE_ALREADY_EXISTS` / `EMAIL_ALREADY_EXISTS`; a race that slips past is
  classified from the provider's 23505. The profile row is read back and, if
  missing, repaired — else the auth user is deleted, so no partial account
  remains. Structured one-line logs (`scope:"auth"`, `requestId`, hashed
  identifier) via `src/lib/auth/log.ts`; no password/token/PII is logged.
- **Verified live end-to-end** (unique throwaway accounts, all deleted
  afterwards; zero leftovers): phone-only signup → created+confirmed → session
  minted → profile row present with `restaurant_id`; email+phone signup likewise;
  a repeated phone returns 23505. `handle_new_user` and the tenant
  `restaurant_id` defaults are healthy.
- **Menu/basket regression (verified live):** the "Add an extra" group on Spicy
  Miso Ramen etc. is `max_select=2` with **3** options; the client used to replace
  the oldest selection instead of refusing, and `place_order` never checked group
  limits at all. Migration `20260923205905_modifier_limit_enforcement.sql`
  re-creates `place_order` with a per-group count → `MODIFIER_LIMIT_EXCEEDED`
  (verified: 3 extras rejected, 2 accepted). The client now refuses the extra tap
  and shows `addToCart.maxExtras`; basket + checkout list every extra with price.
- **Tests:** vitest (`npm test`, config `vitest.config.ts`, `tests/`) — 38 unit
  tests over error mapping, phone canonicalisation, signup validation and the
  modifier rules. `server-only` is stubbed for the node test env. `npm run
  typecheck` added. Lint/typecheck/build green.

## Design/UX engagement (2026-09-23, session 5) — phased, awaiting approval

New brief: production-grade design overhaul; admin must control all visitor-facing
content without a deploy; mascot must be the original sprite (no code-drawn SVG);
public pages must not redirect; bilingual AR/EN. Executed in 8 phases; each phase
is its own commit and is reported pass/fail before moving on. Docs committed:

- `docs/baseline.md` (Phase 0) — systems inventory, mock-content audit (0
  fabricated items found), admin-control audit, mascot audit, live redirect
  matrix, defects D1–D5.
- `docs/env.md` (Phase 1) — every env var, where each secret lives, leak check.
  `INTERNAL_LOG_SALT` documented (was read by `log.ts` but missing from
  `.env.example`).
- `docs/deploy.md` (Phase 2) — Pages/CI topology. `eslint.config.mjs` now ignores
  `.pages/**` (`npm run lint`: 1186 errors to 0). CI is branch-aware
  (main/production to production, else preview).
- `docs/architecture.md` (Phase 3) — content model (`page_content`, `faqs`,
  `delivery_zones`, `announcements`, `page_seo`), admin `/admin/content`, design
  tokens, motion, mascot plan. Stops for approval: Decisions A–D.

Two mascots exist (important). `page-mascot` sprite (M1) is the floating
companion; a hand-drawn SVG `PandaMascot` (M2, `src/components/panda/mascot.tsx`)
is the assistant avatar. Defect D1: `(site)/layout.tsx:105` renders
`PandaAssistant` (its own floating trigger) AND `FloatingPanda`, so two panda
buttons overlap on every customer page (confirmed in live DOM). Fix in Phase 4
pending Decision B.

Do not invent content, contacts, or a new mascot character. `support.*` settings
are empty in the DB on purpose; contact/footer render empty states.

Known blocker for CI auto-deploy: the GitHub repo secret `CLOUDFLARE_API_TOKEN` is
unset and cannot be set from here (`secrets: write` missing). Manual deploy:
`npm run pages:deploy` with a token in the environment.

## Auth audit + ops gate (2026-09-24, session 5)

### Fixed: phone sign-in was broken for accounts that have a real email
`signInAction` always derived `panda-<last10digits>@example.com` from a phone
identifier. That is only correct for a genuinely phone-first account; an account
registered *with* an email lives in Supabase Auth under that email, so signing in
with the phone never matched. Live symptom: `INVALID_CREDENTIALS` for a phone that
had just signed up, while the email worked.

`pickSignInEmail(identifier, storedEmail)` in `src/lib/auth/phone.ts` now resolves
the typed identifier to the address Auth holds: the profile's stored email when it
differs from the placeholder this phone derives, else the placeholder. The lookup
uses `phoneLookupCandidates` so legacy national-form numbers resolve too.
Verified against the live project: the QA account's real email authenticates
(`ok:true`) while the *derived* placeholder returns `invalid_credentials`.

Refinement worth remembering: the discriminator is the **exact derived
placeholder**, not the `example.com` domain — customers (and the QA account)
legitimately register real mailboxes at `example.com`, and skipping those would
lock them out.

### Added: `/admin` shared-passcode gate (layer 1)
`src/lib/auth/admin-gate.ts` — HMAC cookie keyed by the passcode, so rotating
`ADMIN_PASSCODE` (default `panda2026`) invalidates every existing cookie. The
passcode never leaves the server; the client only sees the digest. Wired into
`src/app/admin/layout.tsx` ahead of the staff-role check. This is a second factor,
not a replacement: `requireCapability` and RLS still apply. Verified locally —
unauthed `/admin` = 200 passcode form (no `/auth` redirect); valid cookie = 307 to
`/auth/sign-in?next=/admin`; wrong cookie = passcode form.

### Fixed: HEAD never built (CI failed on every run since "Phase 3")
Commit `a01a898` committed pages importing `@/lib/services/content` and
`@/components/ui/reveal` that were **never tracked**, so `next build` died with
`Module not found`. This was the real cause of the `Deploy Pages` build failure
that had been misdiagnosed as an env-var problem. Fixed in `35d0b46` by committing
the missing closure (content service/actions/screens, reveal, schemas, admin nav).

The Actions build step is now green. The **deploy step still fails** on the unset
`CLOUDFLARE_API_TOKEN` repo secret — an account owner must set it (the integration
token here gets 403 on `secrets: write`). Live `panda-wok.pages.dev` therefore
still runs the old bundle; nothing in this session is deployed yet. Manual deploy:
`npm run pages:deploy` with a token in the environment.


## Contact channels, social links and Asian identity (2026-09-24)
- Public contact data lives in `settings` (`support.phone`, `support.whatsapp`,
  `support.email`, `support.social` as JSON), read by `getPublicSettings` in
  `src/lib/services/catalog.ts`. Live values: phone `01095052232`, WhatsApp
  `01500988196`, socials TikTok/Instagram/Facebook (see below). The AI assistant
  grounding (`src/lib/ai/grounding.ts`) already renders these, so the assistant
  answers with the same numbers and links.
- `src/components/icons/social.tsx` — inline brand SVGs (no dependency) plus
  `socialIcon(key)` (falls back to a globe), `sortSocialEntries` (canonical
  TikTok → Instagram → Facebook → … order) and `socialLabel(t, key)` (translated
  known platforms, capitalised fallback for unknown keys).
- Footer (`SiteFooter` in `src/components/layout/site-shell.tsx`) renders tel /
  WhatsApp / mailto links plus labelled social icon buttons under
  `footer.followUs`; contact page (`/contact`) lists every channel with its icon
  and label.
- WhatsApp links are normalised at render time: Egyptian `01X…` → `wa.me/20…`
  (`replace(/\D/g,"").replace(/^0/,"20")`). Do not store the `20` prefix in
  settings; keep the local `01…` form as the display value.
- **Asian identity** is surfaced from real DB data, not a slogan: restaurant
  `cuisine_tags` (`Japanese-inspired`, `Chinese-inspired`) drive the hero line
  and FAQ; `categories.name_ja` (寿司/中華鍋/ラーメン…) shows beside the localised
  category name on `/menu`; the home `IdentityBand`
  (`src/components/customer/identity-band.tsx`) and the About "identity" section
  name the two kitchens (Japanese sushi counter, Chinese wok) with 日本 / 中华
  glyphs. Dictionary keys are `home.identity*`.

### Social URLs (live)
- TikTok `https://www.tiktok.com/@panda.wok21122`
- Instagram `https://www.instagram.com/panda.wok21122`
- Facebook `https://www.facebook.com/share/1bvsj3obpl/`
These flow into JSON-LD `sameAs` automatically via `restaurantSchema`/`localBusinessSchema`.

## Pages production branch — must deploy with the right `--branch` (2026-09-24)
- The Pages project `panda-wok` has `production_branch = feature/panda-wok-platform`
  (not `production`/`main`). `panda-wok.pages.dev` and the `production.panda-wok.pages.dev`
  alias both serve whatever was deployed **with that branch name**.
- `npm run pages:deploy` used to pass `--branch production`, which created a
  *preview* deployment — the root domain kept serving the old bundle and it looked
  like the deploy silently failed. Fixed: the script no longer pins a branch, so
  wrangler uses the current git branch (which is `feature/panda-wok-platform` =
  production). If you deploy from another branch, pass `--branch feature/panda-wok-platform`
  explicitly to publish to production.
- The `Deploy Pages` GitHub workflow already resolves this correctly for pushes to
  `feature/panda-wok-platform` (else-branch = ref name = production branch). Pushing
  to `main` would produce a preview, not production — only relevant if the default
  branch ever changes.
- Verified live after deploying from `3c1cfc4`: `/`, `/menu`, `/about`, `/contact`,
  `/cart`, `/faq`, `/auth/sign-up`, `/auth/sign-in`, robots/sitemap/llms all 200;
  footer shows phone 01095052232 + WhatsApp 01500988196 + labelled TikTok/Instagram/
  Facebook icon links; `wa.me/201500988196`; identity band (日本/中华) on home, About
  and menu category names; Arabic cookie → `dir="rtl"` with Arabic identity copy.
- Still open: the repo secret `CLOUDFLARE_API_TOKEN` cannot be set with the
  integration token here (`gh secret set` → 403). An account owner must add it for
  push-to-deploy. Manual deploy works with the token in the environment.

## 1102 on /admin (2026-09-24) — transient, verified not reproducible + hardening

- Symptom: correct admin passcode + staff sign-in -> "Error 1102 - Worker exceeded
  resource limits" (Ray a401adf8cc40243c, 12:09:19 UTC).
- Investigation: reproduced the full flow live against `panda-wok.pages.dev` with a
  real staff session (magic-link token via admin API -> /auth/v1/verify -> minted
  sb-xjbtsryidznsxqlynmfa-auth-token cookie) + forged gate cookie
  (createHmac sha256 passcode:panda-wok-gate over open:admin) -> /admin renders 200
  in ~1.6s. The code path is healthy under current (tiny) data.
- No Supabase trace at 12:09 (no auth_logs request, no activity_logs/LOGIN row), so
  the 1102 was thrown at the Cloudflare edge before app code ran - a transient
  resource-limit event on the Free plan (10ms CPU / 50 subrequests / 128MB), likely
  a cold isolate plus the dashboard's ~10 parallel PostgREST subrequests.
- Hardening (committed c94689e): getDashboardMetrics queries in
  src/lib/crm/insights.ts now carry per-query .limit() caps (orders 2000,
  order_items 5000, stock 200, feedback 2000, loyalty 2000, profiles 2000) so worst
  case transfer/in-isolate work cannot blow the Free-plan limits as data grows.
- Google Search Console verification: public/google469af7ac01566c8d.html
  (google-site-verification: google469af7ac01566c8d.html) is committed and is
  emitted into .pages/. It is NOT yet live (404 on pages.dev) because the last
  deploy predates it - deploy then re-check it returns 200.
- Deploy still blocked on the unset CLOUDFLARE_API_TOKEN repo secret (owner must
  add it). Manual: CLOUDFLARE_API_TOKEN=... npm run pages:deploy.

## PageSpeed + Agent-readiness pass (2026-09-24)
- **LCP 5.0s -> target**: PageSpeed flagged 1.1 MiB image savings. All dish
  images were Unsplash 1200px JPEGs served uncompressed. Fix (committed
  c2e7d06): src/lib/images/responsive.ts (dishImageSrc/dishImageSrcSet rewrite
  Unsplash URLs to width-tuned WebP); DishCard/dish-detail/cart/upsell use it
  with explicit width/height + fetchpriority on LCP hero, lazy below fold. DB
  migration 20260924001100 rewrote all 12 menu_items.image_url to
  ?w=800&q=70&fm=webp (applied live).
- **Agent-readiness** (committed 17cd5ed, isitagentready checklist):
  - robots.txt moved to a route handler (app/robots.txt/route.ts) with
    Content-Signal: ai-train=no, search=yes, ai-input=no.
  - Middleware sets RFC 8288 Link header on dynamic docs pointing at
    /llms.txt (alternate, text/markdown) + /sitemap.xml (sitemap).
  - Markdown for Agents: Accept: text/markdown on / /menu /about /contact
    /faq /location /privacy-policy rewrites to /llms-txt with
    Content-Type: text/markdown. Browsers unaffected (they send text/html).
  - /llms.txt serves Content-Type: text/markdown + x-markdown-tokens: full.
  - ARD manifest /.well-known/ai-catalog.json generated from live catalogue
    (llms.txt, sitemap, homepage, each menu category) with ACAO: *.
  - Deliberately NOT implemented (no public API/auth/payments on the site):
    OAuth/OIDC discovery, auth.md, api-catalog, MCP server card, agent-skills
    index, WebMCP, x402/MPP/UCP/ACP. DNS-AID N/A on pages.dev (no zone).

## Admin access, real data, and CJK typography (2026-09-25)

### Admin gate — single credential, verified live
The `/admin` front door is **one field** (`name="secret"`,
`src/components/admin/admin-gate-form.tsx`), resolved by `resolveSecret()` in
`src/lib/auth/admin-gate.ts`:
- `Panda2026` (or `ADMIN_PASSCODE`) -> `{ kind: "owner" }`, full console.
- a staff row's `login_id` -> `{ kind: "staff", role }`, console scoped to that
  role. The owner issues these ids from Admin -> Team & users -> Create a team
  account (admin-only; `roles.manage`). No email/password/customer signup is
  needed for a worker to get in, and no customer is blocked from the site.
The unlock cookie is `panda-wok.admin`, an HMAC keyed by passcode+salt: rotating
the passcode revokes every cookie, and only a digest reaches the browser.

**Verified live (throwaway staff row, deleted after):** passcode -> owner;
`01099988877` -> `{kind:"staff", role:"kitchen"}`; unknown id -> null; and the
LIKE wildcards `%`, `_`, `*` -> null. The wildcard check is the regression that
matters: `staffById` matches via `ilike` for case-insensitivity, and before
`escapeLike()` a secret of `%` matched whichever active row came first and
unlocked the console for anyone. `escapeLike` (`src/lib/utils/format.ts`) now
literalises `\ % _ *`, and the input charset is validated against
`loginIdPattern` on both create and submit. Guards: `tests/login-id.test.ts`.

**To test a staff credential by hand:** create the user with the service-role
admin API (`auth.admin.createUser({email_confirm:true})`), upsert `profiles`,
then `staff` with `role` + `login_id`; delete the auth user afterwards (FK
cascades). A bare `staff` insert fails 23503 unless `auth.users` has the row.

### Fake data removed (verified 0 rows live)
The placeholder catalogue was a single "Sushi" item at EGP 11 using the brand
logo as its image, plus its category. Nothing else was fabricated: faqs,
page_content, announcements, delivery_zones, loyalty_rewards, stock_items,
upsell_rules, modifier_groups, orders are all 0. Removed by
`supabase/migrations/20260925120000_remove_placeholder_catalogue.sql` (review
before applying; the admin CMS is now the only menu source). The stray
`QA Audit Live` profile/`auth.users` row from an earlier auth test was deleted
too. Remaining profiles are real accounts (owner, second owner, one more).

### CJK typography: 华 vs 華
`.font-kana` uses **Shippori Mincho**, a *Japanese* Mincho. Its shipped subset
(`subsets: ["latin","latin-ext"]` is a misnomer — the woff2 carries 17,516 CJK
codepoints) covers 日 本 中 華 寿 司 和 鍋 麺 亜 but **not** simplified 华 亚.
So `identityChineseScript: "中华"` rendered 华 in a different fallback face — a
half-font badge. Fixed to `中華` (traditional, which the face ships), pinned by
`tests/identity-script.test.ts`.

Related: in Arabic the badges show country names (`اليابان` / `الصين`), so the
component now tags them `lang="ar"` and drops `.font-kana` there, instead of
labelling Arabic text as Japanese. Previously it hardcoded `ja`/`zh-Hans`,
which would make a screen reader read Arabic with a Japanese voice.

## Design, ambience and the address map (2026-09-25)

### The address picker already does what was asked
`src/components/customer/location-map.tsx` (committed `1626154`) is the
OpenStreetMap/Leaflet picker: tap or drag a pin, "My location" for the browser
GPS fix (with accuracy shown), a Nominatim search box, and a confirm step before
saving. It writes hidden `latitude`/`longitude`/`accuracyM` fields so the same
`addressSchema` path as the typed form is used. It is wired into
`/account/addresses`; `/checkout` sends customers there with `?next=/checkout`
when they have no address. So "the existing sterile system" the brief complained
about is superseded — verify before rebuilding it.

### Ambient layer (no binary assets)
- `src/components/layout/ambience-sound.tsx` — opt-in WebAudio garden
  soundscape: pentatonic chimes through a soft limiter, filtered-noise air and a
  distant bird. Synthesised, so there are **no audio files** in `public/`.
  Starts only on an explicit tap; the choice persists in localStorage.
- `src/components/customer/leaf-field-2d.tsx` — Canvas2D drifting leaves (the
  only falling-leaf effect on the site; chosen over WebGL deliberately).
- `src/components/customer/bamboo-ambience.tsx` — pure-CSS bamboo culms.
- `src/components/customer/asian-frames.tsx` — asanoha / bamboo frame motifs.
- All are decorative and honour reduced-motion.

### Brand mark
`public/panda-logo.svg` is the one canonical mark (`src/lib/brand.ts`), used by
the navbar, footer, auth, favicon, PWA manifest, OG image and hero plate. No
code-drawn mascot substitutes for it.

### Deliberately NOT invented
`support.email` is `null` and `support.opening_hours` is `{}` in the DB, so
contact and the footer render empty states rather than fake channels. Live
values are the real ones: phones `01095052232` / WhatsApp `01500988196`,
TikTok/Instagram/Facebook under `support.social`, brand
`Panda Wok` / `Asian kitchen, crafted to order` / `Alexandria`, `brand.cuisine`
`Asian cuisine`, delivery fee 30 / free over 250 / ETA 35, min order 80,
tax 14%, loyalty points 1:1.

### Two questions only the owner can answer
1. **Delivery fee policy.** Live: EGP 30 flat, free over EGP 250. The earlier
   brief said "delivery 100" — if that was the intended fee, change
   `delivery.fee` in Admin -> Settings rather than in code.
2. **Opening hours.** `support.opening_hours` is empty, so no hours are shown
   anywhere (including the assistant's grounding). Fill it to publish them.



## Sound removal, About page repair and locale-aware brand copy (2026-09-25)

Deployed to production from `ec31675` (CI run 36185261883, success).

**Sound is gone for good.** The user asked for "الغي الصوت" after an earlier
session added a garden-ambience toggle. `AmbienceToggle`
(`src/components/layout/ambience-sound.tsx`), its two call sites in
`site-shell.tsx` (header + footer) and the `ambience.soundOn/soundOff` keys in
both dictionaries are deleted. There is now no `AudioContext`, oscillator or
`new Audio()` anywhere in `src/`. Do not reintroduce background audio: the site
is meant to be silent, and the visual ambience carries the identity instead.
`BambooAmbience` (CSS culms) and `LeafField2D` (Canvas2D drifting leaves) are
visual only and stay.

**The "our story" page was never missing.** `/about` existed and returned 200
the whole time. What the user saw was two real defects on it:

1. Its identity section still called `home.identityJapaneseScript` and friends —
   keys that an earlier session removed — so the raw key strings rendered as
   visible text. This is the same failure mode as the `{cuisine}` placeholder
   below: a `t()` lookup for a deleted key returns the key path. It now reads
   `about.identityHeading` / `about.identityBody` and renders the kitchen's live
   `cuisine_tags` as badges.
2. `generateMetadata` interpolated a literal `{cuisine}`, so the placeholder
   appeared verbatim in the meta description. It now passes the live cuisine
   tags, or `settings.brand.cuisine` when there are none.

**Lesson worth keeping: when you delete a dictionary key, grep for it.** `tsc`
cannot catch a `t("some.key")` call whose key is gone, because the dictionary is
typed as a whole and the lookup accepts any string. Deleting keys is therefore a
silent, deploy-time-only break. Always `grep -rn "<deleted.key>" src/ tests/`
after trimming a dictionary, and render-check the affected page in both locales.

**Arabic pages no longer show English kitchen copy.** `restaurants.description_ar`,
`tagline_ar` and `name_ar` are all null in the live DB while their `_en`
counterparts are filled, and the About page and site layout read the English
column unconditionally. An Arabic reader got Arabic headings wrapped around an
English sentence. New `src/lib/i18n/brand.ts` centralises the resolution order:
the kitchen's Arabic column, then the caller's translated fallback, then English
as a last resort. `brandName` / `brandTagline` / `brandDescription` are used by
`(site)/layout.tsx`, `(site)/page.tsx` and `(site)/about/page.tsx`.
`about.fallbackTagline` was added to both dictionaries for this.

**Place names are localised for display, not for structured data.**
`localisedPlace` in the same module maps the proper nouns stored in English on
the restaurant row (Alexandria -> الإسكندرية, Egypt -> مصر, plus Cairo, Giza and
two Gulf states) for rendered copy. The `restaurantSchema` JSON-LD deliberately
keeps the canonical English names, because search engines read that graph rather
than the reader's language.

**Verified live after deploy:** `/`, `/about`, `/menu`, `/contact`, `/faq`,
`/location`, `/cart`, `/privacy-policy` all 200; Arabic `/about` renders Arabic
copy with الإسكندرية / مصر; no `AmbienceToggle` or "garden sounds" string in the
served HTML; `tsc` clean; 60 tests pass.

**Data cleanup is complete.** `categories`, `menu_items`, `modifier_groups`,
`modifier_options`, `orders`, `faqs`, `page_content`, `page_seo`,
`loyalty_rewards`, `delivery_zones`, `announcements` and `stock_items` are all
empty (0 rows) — every mock item, category, policy, offer and FAQ is gone, and
the Admin CMS is the only source for the menu. The 28 `settings` rows are
deliberately kept: they are operational configuration (contact numbers, tax
rate, delivery fee, ETA), not fabricated content, and deleting them would break
checkout.

## Interaction sound — opt-in, default off (2026-09-25)
- The earlier "remove all audio" note refers to *ambience* (background loop, no
  gesture, played on load). That stays removed. What exists now is
  `src/lib/sound/engine.ts`: short Web Audio cues on a deliberate tap only.
- Default is **off** per device, persisted in `panda-wok.sound`. No AudioContext
  is constructed until the visitor turns it on from `SoundToggle` (header +
  footer), and that click is the gesture the browser needs to allow audio.
- Cues fire on real state changes only: add-to-cart, cart qty up/down, line
  removal, confirmed order. Turning sound on confirms itself; turning off is
  silent. Never autoplay, never loop, never on navigation.
- Preference is read through `useSyncExternalStore` with a `false` server
  snapshot — reading localStorage during render breaks hydration.
- `tests/sound-engine.test.ts` locks the invariant (silent before opt-in).
- `ADMIN_PASSCODE` (default `Panda2026`) is now documented in `.env.example`.
  It fronts `/admin`; a team member types the `login_id` the owner issued them
  instead, and gets only that member role.
