<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ⛔ قاعدة المنيو — ممنوع أي حد يلعب في داتابيز المنيو

**قاعدة ثابتة لكل الجلسات، من غير استثناء.** (English below.)

- **ممنوع تمامًا** أي حذف (`DELETE` / `DROP` / `TRUNCATE`) ولا أي تعديل على
  بيانات المنيو الحية: `categories`, `menu_items`, `menu_images`,
  `modifier_groups`, `modifier_options`, `upsell_rules` — لا أسعار، لا أسماء،
  لا صور، لا ترتيب.
- **ممنوع** تشغيل أي سكربت استيراد/تصدير أو migration بيلمس صفوف المنيو
  (`scripts/import-menu.mjs` insert-only وبيقفل نفسه، و`scripts/import-menu-csv.mjs`
  بيكتب). مفيش "إعادة رفع لتحديث المنيو" من غير طلب صريح.
- **مفيش استنتاج ولا تجميل:** ممنوع تأليف أو تعديل صنف/سعر من عندك. أي رقم
  أو اسم بيتكتب لازم يكون من المالك بالظبط.
- **التعديل الطبيعي من `/admin` بس** (طبق طبق، بإيد بني آدم وبسياق كامل).
- **الإخفاء بدل الحذف:** لو صنف لازم يخرج من الموقع استخدم العلم
  (`is_available = false` / `is_enabled = false`) — الصف وترجماته وصوره تفضل
  في الداتابيز وترجع بقلب علم واحد.
- **لو مهمة شكلها محتاجة تعديل/حذف في المنيو: قف واسأل المالك الأول**، واذكر
  بالظبط اللي هيتغيّر، واعرض البديل بالإخفاء.
- **المنيوهان الاتنين عامّين ويفضلوا عامّين:** الصيني والياباني (سوشي) شغّالين
  مع بعض على `/menu`، وممنوع تعطيل أي واحد فيهم.

See `docs/data-safety.md` for the full standing policy.

### ⛔ Menu database: do not touch (English)

**A standing rule for every session, no exceptions.**

- **Never** delete (`DELETE` / `DROP` / `TRUNCATE`) and **never** update live menu
  data: `categories`, `menu_items`, `menu_images`, `modifier_groups`,
  `modifier_options`, `upsell_rules` — no prices, names, images or ordering.
- **Never** run an import/export script or a migration that writes menu rows
  unless the owner asked for that exact change in writing. There is no
  "re-import to refresh the menu".
- **Never invent** a dish, price or name. Every value must come from the owner.
- The **only** normal write path is `/admin` (one dish at a time, by a human,
  with full context).
- **Hide, don't delete:** use a flag (`is_available = false` / `is_enabled = false`).
- If a task seems to require touching the menu, **stop and ask the owner first**.
- **Both catalogues are public and stay public** — the Chinese menu and the
  Japanese sushi menu are live together on `/menu`; neither is to be disabled.


## Audit findings (2026-09-23, live project)

Verified against the live database, not just the code:

- **`staff` was empty, so `/admin` was unreachable for everyone.** Every admin RLS
  policy resolves through `current_staff_role()`, which reads `staff`. Nothing in the
  schema or seed ever created a row, so the whole admin/CRM surface was dead. Fixed by
  `20260923001000_bootstrap_staff_access.sql` (idempotent; promotes the founding
  account to `owner`). The row is now live. Promote other staff from the CRM ŌĆö signup
  must never be able to grant a role.
- **The shared delivery pin never reached staff.** `place_order` stores
  `latitude`/`longitude` in `orders.address_snapshot`, but the admin order detail
  rendered only the text address, so "share my exact location" did nothing for the
  driver. The detail page now links to the pin in Maps.
- **Tenancy is currently inert.** `current_restaurant_id()` is
  `select id from restaurants where is_active order by created_at asc limit 1` ŌĆö a
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
- **Leaked-password protection cannot be enabled** ŌĆö Supabase gates
  HaveIBeenPwned checks behind Pro plans (API returns 402/plan message). Noted, not
  fixed.
- **i18n is genuinely complete.** `ar.ts` is typed as `Dictionary` from `en.ts`, so a
  missing Arabic key fails the build. Language switching is live-verified: the
  `panda-wok.locale` cookie flips `<html lang dir>` between `en/ltr` and `ar/rtl`.
  Gap: `AppError.message` from `@/lib/utils/errors` is English-only and is what the
  client renders for business errors, so error copy does not translate.
- **Auth:** anonymous sign-ins are now enabled on the project; email/password is
  still enabled because `staff`/admin login uses it (disabling it locks the owner out
  of `/admin` ŌĆö verified). `profiles.email` is `citext` and nullable; placeholder
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
> assets directory automatically the way Workers does ŌĆö with a bare OpenNext
> `_worker.js` the HTML renders but every `/_next/static/*` request 404s. The fix is
> `scripts/pages/_worker.js`, a thin entrypoint that offers static-looking requests to
> `ASSETS` first and falls through to the OpenNext handler otherwise.
> `npm run pages:build` (OpenNext build + `scripts/build-pages.mjs`) assembles `.pages/`,
> which CLI-deploys cleanly. Verified live on https://panda-wok.pages.dev: SSR pages,
> middleware auth redirects, dynamic slugs, Supabase-rendered data, robots/sitemap/llms,
> opengraph image, Arabic RTL, and CSS/JS/assets all 200.
> Caveat: the Pages *CI* bundler still fails on `wrangler pages functions build` with
> "Could not resolve http/https/tty" even with `nodejs_compat` set in the dashboard ŌĆö
> dashboard compatibility flags are not reaching the CI Functions bundler, so build via
> CLI (`npm run pages:deploy`) until that is resolved.

- ~~Live topology: https://panda-wok.pages.dev = **302 redirector** ŌåÆ canonical **Worker** https://panda-wok.yk445kauod.workers.dev~~ (superseded: `panda-wok.pages.dev` now serves the app directly over SSR with no redirect; `num_redirects=0` verified).
- Deploy worker: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` (wrangler.jsonc: main `.open-next/worker.js` + assets `.open-next/assets`+ AI binding).
- Worker alias: https://panda-wok.yk445kauod.workers.dev (from `opennextjs-cloudflare deploy`).
- Remote Supabase project: xjbtsryidznsxqlynmfa; tenancy migration applied remotely as `011_tenancy_fk_hardening` (local file: supabase/migrations/20260922001000_tenancy_fk.sql ŌĆö same body, different version name ŌĆö avoid double-`db push` of the same body).
- Pages project: static-only redirector site (`_redirects` `/* ŌåÆ worker` 302 + fallback `index.html`;no `_worker.js`). Secrets NEXT_PUBLIC_SUPABASE_URL/ANON, SUPABASE_URL, SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL set on Pages;the Worker's secrets live in its own env ŌĆö keep both in sync.
- Auth: email optional at signup (phone-first;placeholder email `panda-<last10digits>@phone.pandawok.app`;auto-confirmed via service-role `admin.updateUserById(email_confirm: true)` when no real email;sign-in accepts phone too (maps to the placeholder);`/auth/forgot-password` = phone-or-email reset (route was missing ŌåÆ now created+live).
- Branding: settings keys `brand.logo_url` / `brand.favicon_url` / `brand.banner_url` (optional,is_public) ŌĆö when set, footer/about/auth/OG render the uploaded logo via `BrandLogo`;fallback = `/icon.svg`(repo panda mark;file: `public/panda-logo.svg`). Admin sets via Settings ŌåÆ brand rows (generic string editor).

## Codebase map (2026-09-23)

- Customer app: src/app/(site)/* ŌĆö home, menu, dish, cart, checkout, orders, tracking, account, loyalty, feedback, contact, about.
- i18n: ALL customer pages run through `src/lib/i18n/` ŌĆö `dictionaries/en.ts` + `dictionaries/ar.ts` (single source of truth for strings), `server.ts` (`getLocale`/`getT`), `config.ts` (`Locale`), `translate.ts`, `catalog.ts`, `orders.ts`, `loyalty.ts` (`tierLabel`). RTL handled by `dir=rtl` on `<html>` + Tailwind logical props (`text-end`, `ms-`, `me-`, `start/end`). Server components call `getT(locale)`; client components use `useT()` from `i18n-provider`. Localised customer pages so far: menu, dish, cart, checkout, orders+detail, account+addresses, feedback, loyalty. Admin uses the shared i18n dictionary; page copy and operational labels must go through `admin.pages.*`, `admin.term.*` or `admin.common.*`.
- Admin/CRM: src/app/admin/* ŌĆö dashboard, orders, kitchen, users, CRM, segments, loyalty, feedback, broadcast, messages, AI centre, analytics, stock, upsell, menu CMS, settings, backups, exports. Guarded by src/middleware.ts (role-based), non-indexable.
- Auth: src/app/auth/* + supabase SSR session via src/lib/supabase/*
- Server actions = the API layer for mutations: src/lib/actions/* (there is NO src/lib/server-actions dir)
- Services: src/lib/services/catalog.ts (restaurant singleton, menu, slugs, flags), ai/ (assistant + provider chain + insights), crm/, services/orders.ts + services/order-workflow.ts. NOTE: README's src/lib/orders|backup|export|feedback|messages|broadcast|stock|loyalty dirs do NOT exist ŌĆö the code is consolidated under src/lib/services, src/lib/crm, src/lib/ai.
- Schema: supabase/migrations/* ŌĆö single source of truth; RLS in 007_rls_and_storage; tenancy FK in 011 (remote) / 20260922001000 (local).
- SEO/AEO: src/lib/seo/, src/app/robots.ts, sitemap.ts, llms-txt/route.ts; schema.org from live DB only.
- Deploy: wrangler.jsonc (opennext worker + AI binding), open-next.config.ts; next.config.ts (standalone, unoptimized images, llms.txt rewrite).

## Critical fixes (2026-09-23 session)
Two live-breaking defects on the remote project `xjbtsryidznsxqlynmfa` (both verified fixed + regression-tested via a rolled-back transaction):

1. **Signup and order placement were 100% broken.** Migration `011_tenancy_fk_hardening` added `restaurant_id` as `NOT NULL` to `profiles`/`orders`/`menu_items`/`categories` with **no default and no trigger**, while `handle_new_user()` and `place_order()` never set the column ŌåÆ every insert raised `null value in column "restaurant_id"`. Fix: `alter column restaurant_id set default public.current_restaurant_id()` on all four tables (migration `20260923000100_tenancy_defaults_and_hardening.sql`, applied remotely as `tenancy_defaults_and_hardening`).
2. **`orders_total_consistency_check` rejected every order.** The live constraint was `CHECK (total = round(subtotal - discount_total + delivery_fee + tax_total))` ŌĆö single-arg `round()` truncates to an INTEGER, so any total with piastres failed. Fix: re-create with `round(..., 2)` (migration `20260923000300_orders_total_constraint_fix.sql`, applied as `orders_total_constraint_fix`).

Also applied: `20260923000200_rls_initplan.sql` (22 self-row policies rewritten as `(select auth.uid())`), pinned `search_path` on `touch_updated_at`/`order_is_editable`/`next_order_number`, and revoked `rls_auto_enable` execute from `anon`/`authenticated`.

**Migration drift ŌĆö resolved.** The repo is now linked to the live project (`supabase link --project-ref xjbtsryidznsxqlynmfa`; config in `supabase/config.toml`). The remote `supabase_migrations.schema_migrations` history was reconciled to match the 13 files in `supabase/migrations/` (locally-only and remote-only entries were repaired to a single aligned list; no schema/data change). `supabase db push` is now a verified no-op.

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
- The app Worker itself never redirects: the 307s on `/checkout` `/orders` `/loyalty` `/admin` are auth middleware, and `/<route>/` ŌåÆ `/<route>` 308 is Next's trailing-slash canonicalisation.
- Deploy: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`. `NEXT_PUBLIC_*` are **inlined at build time**, so export production values before building or the deployed bundle keeps whatever was in scope.
- Worker secrets (own env, set with `wrangler secret put`): `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `VAULT_TOKEN`, `AI_API_TOKEN`, `AI_CLOUDFLARE_API_KEY`, `AI_CLOUDFLARE_NAME`.
- `NEXT_PUBLIC_SITE_URL` must be the Worker URL (`https://panda-wok.yk445kauod.workers.dev`) ŌĆö it drives canonical/OG/sitemap URLs, so `localhost` there leaks into production metadata.

### Pages CI is disabled on purpose (2026-09-23)
- The Pages project `panda-wok` is GitHub-connected (production branch `production`, preview on `*`), so **every push used to kick off a preview build that always failed**. Root cause: `src/app/api/analytics/route.ts` imports `src/lib/config/env.ts`, which throws at module load when `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are absent. Pages *preview* has `env_vars: null` and its *production* vars are present but **empty** (`secret_text` with `value: ""`), so the build died during "Collecting page data".
- The Pages build config is also structurally wrong for this app: `build_command: npx next build` with `destination_dir: out`, but `next.config.ts` uses `output: "standalone"` and Next never emits `out/`.
- **Fix applied:** `deployments_enabled: false` + `production_deployments_enabled: false` on the Pages project (via `PATCH /accounts/<id>/pages/projects/panda-wok` with `{"source":{"config":{...}}}` ŌĆö the top-level form is silently ignored). Pages is only a redirector here, so it has no business building the Next app. Re-enable deliberately only if you also set the preview vars and a matching build config.
- The live `panda-wok.pages.dev` 302 ŌåÆ Worker is served by an older **ad-hoc production deployment from 11:39**, not by any current build. If it ever needs replacing, publish the redirector as static assets rather than re-enabling the Next build.

## Satellite workers (2026-09-23, session 2 ŌĆö deployed)
- `workers/ai-api` ŌåÆ `https://panda-wok-ai-api.yk445kauod.workers.dev`. Bearer-guarded proxy over the account's Workers AI binding. Implements the exact `POST /ai/run/<model>` contract the app's `cloudflare` remote provider builds, so it is a drop-in base URL. `/health` is open; no token = 401. Default model `@cf/meta/llama-4-scout-17b-16e-instruct` (the previous `llama-3.1-8b-instruct` is deprecated ŌĆö the binding errors if named).
- `workers/secrets-vault` ŌåÆ `https://panda-wok-secrets.yk445kauod.workers.dev`. Single server-side home for service keys. `GET /secrets/<NAME>` returns one allow-listed value behind a constant-time bearer check; there is deliberately **no bulk-dump route** (requesting `/secrets` is 404). `/health` reports configured names only, never values.
- Shared tokens live in `.agent_tmp/worker-tokens.env` (gitignored) ŌĆö regenerate and re-`secret put` if lost; they are not recoverable from the workers.

## AI provider chain (2026-09-23, session 2 ŌĆö live)
- The assistant's chain is **DB-driven**: `buildDbProviderChain` reads `ai_providers` rows; the env `buildProviderChain` is only a fallback path.
- Migration `20260923002000_ai_binding_provider.sql` adds row `workers-ai-binding` (`kind='cloudflare'`, `secret_ref=null`, `priority=10`) so the **keyless Workers AI binding** is the live primary. `resolveDbProvider` returns null when the binding is absent (plain `next dev`/`next build`), so the chain drops to the `deterministic` row at priority 900 and the assistant still answers without a key.
- Verified live: `ai_requests` logged `provider: "Workers AI"`, `model: llama-4-scout`, `status: ok`. Before this row existed every request logged `deterministic`/`fallback`.
- The AI worker's URL/model are wired on the app Worker as `AI_CLOUDFLARE_BASE_URL` / `AI_CLOUDFLARE_MODEL` vars (remote fallback), with `AI_CLOUDFLARE_API_KEY` holding the shared AI token.

## i18n (AR/EN) ŌĆö verified live (2026-09-23, session 2)
- Both dictionaries are at parity: 481 keys each, no key missing from `ar.ts`. The switcher is mounted in `site-shell` (header + footer), `/account`, and `auth/layout`.
- Resolution order in `getLocale()`: explicit cookie (`panda-wok.locale`) ŌåÆ signed-in `profiles.locale` ŌåÆ `Accept-Language` ŌåÆ English.
- Verified on the **live Worker**: `Cookie: panda-wok.locale=ar` ŌåÆ `<html lang="ar" dir="rtl">`; default ŌåÆ `<html lang="en" dir="ltr">`; `Accept-Language: ar` ŌåÆ RTL. Arabic copy renders.
- **Deploy gotcha:** locale switching appeared broken until the Worker was rebuilt. The live bundle predated the i18n commit ŌĆö always rebuild+redeploy after app changes, then re-test with the cookie before assuming a code bug.

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
  the trigger raised 23505, and Supabase aborted the whole `auth.users` insert ŌĆö
  a 500 the UI could only render as `UNKNOWN`. `signInWithPassword` then failed
  because no auth user had ever been created for that email/phone. Reproduced in
  a rolled-back transaction: `insert into profiles (...) values (ŌĆ”, '01277593815', ŌĆ”)`
  ŌåÆ `23505 duplicate key value violates unique constraint "profiles_phone_key"`.
- **The live constraints are only on `profiles`**: `profiles_pkey (id)` plus a
  unique `profiles_phone_key` and `profiles_email_key` (not listed by a
  `pg_constraint` scan for `contype in ('u','p')` because they are unique
  *indexes*; query `pg_indexes`/`information_schema`, not just `pg_constraint`).
  Phone is stored in three shapes across history (`01277593815` legacy,
  `+201ŌĆ”` canonical), so any duplicate lookup must match all of them.
- **Live auth config (Management API `/config/auth`)**: `mailer_autoconfirm=false`,
  no custom SMTP (`smtp_host=null`), `rate_limit_email_sent=2` per hour,
  `external_email_enabled=true`, `external_phone_enabled=false`,
  `external_anonymous_users_enabled=true`. Meaning: an emailed confirmation is
  *not* dependable (no SMTP, 2/hour project-wide) ŌĆö every customer supplying an
  email would be either stranded at a confirmation wall or would exhaust the
  quota and fail signups for everyone. `external_phone_enabled=false` also means
  the derived placeholder **email** identifier is unavoidable.
- **Fix (code, no schema change needed):** all signups now go through the
  service-role admin API (`auth.admin.createUser({ email_confirm: true })`) and
  are signed in immediately, so nothing depends on the mailer. A pre-flight
  profile lookup across every stored phone shape returns a specific
  `PHONE_ALREADY_EXISTS` / `EMAIL_ALREADY_EXISTS`; a race that slips past is
  classified from the provider's 23505. The profile row is read back and, if
  missing, repaired ŌĆö else the auth user is deleted, so no partial account
  remains. Structured one-line logs (`scope:"auth"`, `requestId`, hashed
  identifier) via `src/lib/auth/log.ts`; no password/token/PII is logged.
- **Verified live end-to-end** (unique throwaway accounts, all deleted
  afterwards; zero leftovers): phone-only signup ŌåÆ created+confirmed ŌåÆ session
  minted ŌåÆ profile row present with `restaurant_id`; email+phone signup likewise;
  a repeated phone returns 23505. `handle_new_user` and the tenant
  `restaurant_id` defaults are healthy.
- **Menu/basket regression (verified live):** the "Add an extra" group on Spicy
  Miso Ramen etc. is `max_select=2` with **3** options; the client used to replace
  the oldest selection instead of refusing, and `place_order` never checked group
  limits at all. Migration `20260923205905_modifier_limit_enforcement.sql`
  re-creates `place_order` with a per-group count ŌåÆ `MODIFIER_LIMIT_EXCEEDED`
  (verified: 3 extras rejected, 2 accepted). The client now refuses the extra tap
  and shows `addToCart.maxExtras`; basket + checkout list every extra with price.
- **Tests:** vitest (`npm test`, config `vitest.config.ts`, `tests/`) ŌĆö 38 unit
  tests over error mapping, phone canonicalisation, signup validation and the
  modifier rules. `server-only` is stubbed for the node test env. `npm run
  typecheck` added. Lint/typecheck/build green.

## Design/UX engagement (2026-09-23, session 5) ŌĆö phased, awaiting approval

New brief: production-grade design overhaul; admin must control all visitor-facing
content without a deploy; mascot must be the original sprite (no code-drawn SVG);
public pages must not redirect; bilingual AR/EN. Executed in 8 phases; each phase
is its own commit and is reported pass/fail before moving on. Docs committed:

- `docs/baseline.md` (Phase 0) ŌĆö systems inventory, mock-content audit (0
  fabricated items found), admin-control audit, mascot audit, live redirect
  matrix, defects D1ŌĆōD5.
- `docs/env.md` (Phase 1) ŌĆö every env var, where each secret lives, leak check.
  `INTERNAL_LOG_SALT` documented (was read by `log.ts` but missing from
  `.env.example`).
- `docs/deploy.md` (Phase 2) ŌĆö Pages/CI topology. `eslint.config.mjs` now ignores
  `.pages/**` (`npm run lint`: 1186 errors to 0). CI is branch-aware
  (main/production to production, else preview).
- `docs/architecture.md` (Phase 3) ŌĆö content model (`page_content`, `faqs`,
  `delivery_zones`, `announcements`, `page_seo`), admin `/admin/content`, design
  tokens, motion, mascot plan. Stops for approval: Decisions AŌĆōD.

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
placeholder**, not the `example.com` domain ŌĆö customers (and the QA account)
legitimately register real mailboxes at `example.com`, and skipping those would
lock them out.

### Added: `/admin` shared-passcode gate (layer 1)
`src/lib/auth/admin-gate.ts` ŌĆö HMAC cookie keyed by the passcode, so rotating
`ADMIN_PASSCODE` (default `panda2026`) invalidates every existing cookie. The
passcode never leaves the server; the client only sees the digest. Wired into
`src/app/admin/layout.tsx` ahead of the staff-role check. This is a second factor,
not a replacement: `requireCapability` and RLS still apply. Verified locally ŌĆö
unauthed `/admin` = 200 passcode form (no `/auth` redirect); valid cookie = 307 to
`/auth/sign-in?next=/admin`; wrong cookie = passcode form.

### Fixed: HEAD never built (CI failed on every run since "Phase 3")
Commit `a01a898` committed pages importing `@/lib/services/content` and
`@/components/ui/reveal` that were **never tracked**, so `next build` died with
`Module not found`. This was the real cause of the `Deploy Pages` build failure
that had been misdiagnosed as an env-var problem. Fixed in `35d0b46` by committing
the missing closure (content service/actions/screens, reveal, schemas, admin nav).

The Actions build step is now green. The **deploy step still fails** on the unset
`CLOUDFLARE_API_TOKEN` repo secret ŌĆö an account owner must set it (the integration
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
- `src/components/icons/social.tsx` ŌĆö inline brand SVGs (no dependency) plus
  `socialIcon(key)` (falls back to a globe), `sortSocialEntries` (canonical
  TikTok ŌåÆ Instagram ŌåÆ Facebook ŌåÆ ŌĆ” order) and `socialLabel(t, key)` (translated
  known platforms, capitalised fallback for unknown keys).
- Footer (`SiteFooter` in `src/components/layout/site-shell.tsx`) renders tel /
  WhatsApp / mailto links plus labelled social icon buttons under
  `footer.followUs`; contact page (`/contact`) lists every channel with its icon
  and label.
- WhatsApp links are normalised at render time: Egyptian `01XŌĆ”` ŌåÆ `wa.me/20ŌĆ”`
  (`replace(/\D/g,"").replace(/^0/,"20")`). Do not store the `20` prefix in
  settings; keep the local `01ŌĆ”` form as the display value.
- **Asian identity** is surfaced from real DB data, not a slogan: restaurant
  `cuisine_tags` (`Japanese-inspired`, `Chinese-inspired`) drive the hero line
  and FAQ; `categories.name_ja` (Õ»┐ÕÅĖ/õĖŁĶÅ»ķŹŗ/Ńā®Ńā╝ŃāĪŃā│ŌĆ”) shows beside the localised
  category name on `/menu`; the home `IdentityBand`
  (`src/components/customer/identity-band.tsx`) and the About "identity" section
  name the two kitchens (Japanese sushi counter, Chinese wok) with µŚźµ£¼ / õĖŁÕŹÄ
  glyphs. Dictionary keys are `home.identity*`.

### Social URLs (live)
- TikTok `https://www.tiktok.com/@panda.wok21122`
- Instagram `https://www.instagram.com/panda.wok21122`
- Facebook `https://www.facebook.com/share/1bvsj3obpl/`
These flow into JSON-LD `sameAs` automatically via `restaurantSchema`/`localBusinessSchema`.

## Pages production branch ŌĆö must deploy with the right `--branch` (2026-09-24)
- The Pages project `panda-wok` has `production_branch = feature/panda-wok-platform`
  (not `production`/`main`). `panda-wok.pages.dev` and the `production.panda-wok.pages.dev`
  alias both serve whatever was deployed **with that branch name**.
- `npm run pages:deploy` used to pass `--branch production`, which created a
  *preview* deployment ŌĆö the root domain kept serving the old bundle and it looked
  like the deploy silently failed. Fixed: the script no longer pins a branch, so
  wrangler uses the current git branch (which is `feature/panda-wok-platform` =
  production). If you deploy from another branch, pass `--branch feature/panda-wok-platform`
  explicitly to publish to production.
- The `Deploy Pages` GitHub workflow already resolves this correctly for pushes to
  `feature/panda-wok-platform` (else-branch = ref name = production branch). Pushing
  to `main` would produce a preview, not production ŌĆö only relevant if the default
  branch ever changes.
- Verified live after deploying from `3c1cfc4`: `/`, `/menu`, `/about`, `/contact`,
  `/cart`, `/faq`, `/auth/sign-up`, `/auth/sign-in`, robots/sitemap/llms all 200;
  footer shows phone 01095052232 + WhatsApp 01500988196 + labelled TikTok/Instagram/
  Facebook icon links; `wa.me/201500988196`; identity band (µŚźµ£¼/õĖŁÕŹÄ) on home, About
  and menu category names; Arabic cookie ŌåÆ `dir="rtl"` with Arabic identity copy.
- Still open: the repo secret `CLOUDFLARE_API_TOKEN` cannot be set with the
  integration token here (`gh secret set` ŌåÆ 403). An account owner must add it for
  push-to-deploy. Manual deploy works with the token in the environment.

## 1102 on /admin (2026-09-24) ŌĆö transient, verified not reproducible + hardening

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

### Admin gate ŌĆö single credential, verified live
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

### CJK typography: ÕŹÄ vs ĶÅ»
`.font-kana` uses **Shippori Mincho**, a *Japanese* Mincho. Its shipped subset
(`subsets: ["latin","latin-ext"]` is a misnomer ŌĆö the woff2 carries 17,516 CJK
codepoints) covers µŚź µ£¼ õĖŁ ĶÅ» Õ»┐ ÕÅĖ ÕÆī ķŹŗ ķ║║ õ║£ but **not** simplified ÕŹÄ õ║Ü.
So `identityChineseScript: "õĖŁÕŹÄ"` rendered ÕŹÄ in a different fallback face ŌĆö a
half-font badge. Fixed to `õĖŁĶÅ»` (traditional, which the face ships), pinned by
`tests/identity-script.test.ts`.

Related: in Arabic the badges show country names (`ž¦┘ä┘Ŗž¦ž©ž¦┘å` / `ž¦┘äžĄ┘Ŗ┘å`), so the
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
about is superseded ŌĆö verify before rebuilding it.

### Ambient layer (no binary assets, no audio)
- `src/components/customer/leaf-field-2d.tsx` ŌĆö Canvas2D drifting leaves (the
  only falling-leaf effect on the site; chosen over WebGL deliberately).
- `src/components/customer/bamboo-ambience.tsx` ŌĆö pure-CSS bamboo culms.
- `src/components/customer/asian-frames.tsx` ŌĆö asanoha / bamboo frame motifs.
- All are decorative and honour reduced-motion.

**There is no sound layer and there must not be one.** No `AudioContext`, no
oscillator, no `new Audio()`, no audio files in `public/`. The site is silent by
design; the visual ambience carries the Asian identity instead.

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
   brief said "delivery 100" ŌĆö if that was the intended fee, change
   `delivery.fee` in Admin -> Settings rather than in code.
2. **Opening hours.** `support.opening_hours` is empty, so no hours are shown
   anywhere (including the assistant's grounding). Fill it to publish them.



## Sound removal, About page repair and locale-aware brand copy (2026-09-25)

Deployed to production from `ec31675` (CI run 36185261883, success).

**Sound is gone for good, and stays gone.** An earlier session added a
garden-ambience toggle (`AmbienceToggle` in
`src/components/layout/ambience-sound.tsx`, with call sites in `site-shell.tsx`
and `ambience.soundOn/soundOff` dictionary keys). It has been removed, and the
removal is a standing rule, not a one-off cleanup: **do not add interface sound
in any form.** No `AudioContext`, no oscillator, no `new Audio()`, no audio
files in `public/`, no mute toggle ŌĆö there is nothing to mute. The site is
silent by design; the visual ambience carries the Asian identity instead.
`BambooAmbience` (CSS culms) and `LeafField2D` (Canvas2D drifting leaves) are
visual only and stay.

**The "our story" page was never missing.** `/about` existed and returned 200
the whole time. What the user saw was two real defects on it:

1. Its identity section still called `home.identityJapaneseScript` and friends ŌĆö
   keys that an earlier session removed ŌĆö so the raw key strings rendered as
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
the restaurant row (Alexandria -> ž¦┘äžźž│┘ā┘åž»ž▒┘Ŗž®, Egypt -> ┘ģžĄž▒, plus Cairo, Giza and
two Gulf states) for rendered copy. The `restaurantSchema` JSON-LD deliberately
keeps the canonical English names, because search engines read that graph rather
than the reader's language.

**Verified live after deploy:** `/`, `/about`, `/menu`, `/contact`, `/faq`,
`/location`, `/cart`, `/privacy-policy` all 200; Arabic `/about` renders Arabic
copy with ž¦┘äžźž│┘ā┘åž»ž▒┘Ŗž® / ┘ģžĄž▒; no `AmbienceToggle` or "garden sounds" string in the
served HTML; `tsc` clean; 60 tests pass.

**Data cleanup is complete.** > **Superseded (2026-09-26):** the Chinese menu was loaded after this note was written, and the Japanese sushi menu after that. See the catalogue note at the end of this file. The paragraphs below describe the moment the mock rows were removed, not the current state.

`categories`, `menu_items`, `modifier_groups`,
`modifier_options`, `orders`, `faqs`, `page_content`, `page_seo`,
`loyalty_rewards`, `delivery_zones`, `announcements` and `stock_items` are all
empty (0 rows) ŌĆö every mock item, category, policy, offer and FAQ is gone, and
the Admin CMS is the only source for the menu. The 28 `settings` rows are
deliberately kept: they are operational configuration (contact numbers, tax
rate, delivery fee, ETA), not fabricated content, and deleting them would break
checkout.

## UX scroll-reveal sweep (2026-09-25, session committed 83f7de1 ŌåÆ c5a699e)

- `src/components/ui/reveal.tsx` ŌĆö bidirectional IntersectionObserver reveal;
  starts "shown" (JS-off safe), demotes below-the-fold to pending in a layout
  effect, promotes on scroll, respects `prefers-reduced-motion`. `as` now also
  accepts `"header"` (the previous union was div/section/li/article).
- Reveal is applied across: home, menu (+ empty states, with a gentle
  `LeafField2D` behind the all-empty state), category page, dish detail (image,
  info column, related panel), cart/checkout (each step: fulfilment, address,
  pickup, payment, loyalty, note, summary), orders list + order detail
  (banner, header, timeline, items, where), account (header, stats, active
  order, profile, addresses), addresses page.
- Ambient identity (already live before this session, verified present):
  `BambooAmbience` (hero + identity band) and `SakuraField` / `LeafField2D`
  falling leaves (hero + brand banner).
- Sound is deliberately absent ("site is silent by design"); no audio was
  added.
- Brand fonts wired in `src/app/layout.tsx`: IBM Plex Sans + IBM Plex Sans
  Arabic (body/display) with Shippori Mincho as the Japanese accent.
- Menu/loyalty/account empty states and all `washi-panel` sections inherit the
  `data-reveal` treatment ŌĆö content stays in the DOM (readable, indexable).

**Admin gate (verified present):** `/admin` is sealed by a single-field HMAC
passcode gate (`src/lib/auth/admin-gate.ts`, cookie `panda-wok.admin`, default
`Panda2026`). The owner's passcode unlocks the full console; staff accounts
created in Admin ŌåÆ Users carry a `login_id`, and typing that id in the gate
unlocks only the member's role-scoped console (`requireCapability` + RLS still
apply). Owner creates accounts for any role with a chosen phone/id.

**Map address picker (verified present):** `address-book.tsx` (used on
`/account/addresses` + checkout) embeds `location-map.tsx` ŌĆö an OpenStreetMap
picker with GPS autofill via the browser geolocation API and reverse geocode,
letting the customer confirm a pin on a map instead of typing only. The
customer picks a point, the address fills in for confirmation.


## Bamboo identity + contrast pass (2026-09-25, pushed fdc04a1)
- .bamboo-culm is now 7px wide, brighter bamboo-600/500 internode rings, a bamboo-400 rim-lit edge + ground shadow; BambooAmbience hero density = 7 culms in a w-24 container, 44-70px tall. Hero also drifts LeafField2D count=16 (bamboo-green/sakura/maple) over the ink - sakura is the Japanese half, wok/bamboo the Chinese.



- Contrast overhaul (all in globals.css): body ground stirs a lantern-lit horizon ( bamboo-600/indigo-700/miso-700 radial casts, background-attachment: fixed);.page-sheet/.washi-paper/.washi-banner gain the banded washi edges + grain dots + sheen;.glass-bar/.glass-card now carry their OWN lacquer gradient ( ink-green/miso - no longer transparent --glass-* vars),with cream rice-100 hairline edges. .hero-night interiors are a deep ink with a vermillion miso-500 top seam.



- Admin language switcher: AdminShell (client) now imports useI18n and mounts <LanguageSwitcher current={locale} variant="compact"/> on the mobile top bar and the desktop sidebar - the console follows the cookie like the customer app. Admin UI page copy now follows the shared locale cookie; new screens must use the `admin.*` dictionary instead of hardcoded visible English.



- Mock-data cleanup (verified, DB, at the time): categories/menu_items/page_content/faqs/delivery_zones/announcements/orders were all 0 rows on the live project. **No longer true for the menu** — see the catalogue note at the end of this file. Only real persistence remains: settings ( 28 rows - phones/socials/brand) + 2 ai_providers rows ( infra.). No offers/coupons tables exist - nothing stale to purge.


## Perf + admin forms pass (2026-09-25, session 6 - pushed 9e32f46)
- First-load JS cut approx 22% on customer pages (measured on the standalone build: 793KB to 618KB raw chunk sum for /(). PageEnter was rewritten CSS-only (zero JS, no framer-motion. PandaAssistant + FloatingPanda moved out of the server)(site)/layout.tsx into src/components/layout/site-widgets.tsx - a client component so { ssr: false, loading: null } is legal; done THAT-way (not via dynamic in the server layout) really removes their bundles from the SSR HTML (Turbopack still hoists dynamic chunks referenced from a server component into the initial import map even with loading:null - ssr:false only defers execution; the elimination requires the client boundary).
- Admin menu forms are leaner. MenuItemForm now leads with name/price/category/image and folds attributes/nutrition/SEO/stock into a <details> More options. CategoryForm likewise (photo first.
- Direct image upload added: src/lib/actions/storage.ts (uploadMenuImageAction, capability menu.manage, uploads to the existing public menu-images bucket, <=8MB PNG/JPEG/WebP/AVIF) + src/components/admin/image-upload-field.tsx (live preview, hidden imageUrl input - no manual URL pasting. Both menu-item + category forms now mount it. Reuses assertCapability,actionOk/Fail (positional - do NOT pass {code,message} object to actionFail).
- Image hygiene: dish images were already loading eager/lazy + fetchPriority + decoding async through dishImageSrc(Set; added decoding=async to brand-logo + menu-item-row. Home hero + upload-preview <img>s are intentionally plain img (local SVG/blob - next/image inapplicable); eslint disable comments standard.
- Still blocked: deployment to Pages needs the repo secret CLOUDFLARE_API_TOKEN set by an account owner(repo secret set is 403 with the integration token. Manual: CLOUDFLARE_API_TOKEN=npm run pages:deploy (branch feature/panda-wok-platform = production).

## Customer design overhaul + real ratings (2026-09-26, pushed f8eded3)

Sushi-reference composition pass over the customer surface, on existing tokens
and i18n. New: `src/components/customer/dish-card.tsx` (shared card: image,
rating, price, action), `popular-menu.tsx` (client category filter over real
rows), `editorial-sections.tsx` (image/text spreads that alternate sides),
`star-rating.tsx`. Hero gained a stat row (dish count, ETA, delivery threshold,
average rating). `/menu` section headings now use `font-display text-fluid-h3`.

### Ratings are computed, never invented
`menu_item_ratings` (migration `20260926120000`) aggregates
`feedback.rating` where `is_public` and tied to an order. The brand rule is
that nothing visitor-facing is fabricated, so there is no hardcoded "4.9": the
card renders a star only when `rating_count > 0` and shows the count beside it.
The single pre-existing live feedback row has `order_id = null` and
`is_public = false`, so the menu currently shows no stars ŌĆö correct, not broken.

**Defect found and fixed (`20260926130000`): the view was dead for every
visitor.** It was created `security_invoker` on the stated assumption that
"all three base tables expose a public read path". They do not ŌĆö `feedback`
has only `feedback_self_read` (auth.uid()) / `feedback_staff_read`, and
`orders` only `orders_owner_read` / `orders_staff_read`; **all four are
`authenticated`-only, there is no anon policy on either table.** Evaluated as
`anon` the view matched zero rows and returned **HTTP 200 with no error and no
log** ŌĆö a silent empty result, the worst failure mode. It is now
`security_invoker = false` (definer rights), which is sound because the view
projects only `(menu_item_id, rounded average, count)`: no user id, no order
id, no review text. Do **not** "fix" this by adding an anon SELECT policy to
`feedback` ŌĆö that would expose raw review text, user ids and image URLs to
every anonymous visitor.

Two traps worth remembering from this one:
- A `security_invoker` view is not automatically RLS-safe for a public page.
  Check the *policies on the base tables* for the role that will actually read
  it (`anon` here), not the grants.
- Because a definer view does not consult RLS, the view's own `where
  f.is_public` is now load-bearing, not belt-and-braces.

Verified live in a rolled-back transaction: ratings 5+4 consented -> `4.5` /
count 2, and an un-consented 1-star correctly excluded. Then confirmed in the
DOM (`4.7 ┬Ę 3 ratings ┬Ę 4.7 out of 5`) with temporary rows, which were deleted.

### Two layout bugs that only a real browser shows
1. **A bare `grid` is not `grid-cols-1`.** An implicit grid column is `auto`,
   so its min-content floor is set by the widest unbreakable child ŌĆö the
   `truncate` spans (nowrap reports full unwrapped width) forced the editorial
   column to 445px inside a 358px container and pushed the whole page
   sideways on a phone. Use `grid-cols-1` (`minmax(0, 1fr)`) or explicit
   `minmax(0, Xfr)` tracks. `wideElements: []` will *not* catch this, because
   the overflowing element is the grid container, which is itself in flow.
2. **A transformed box counts toward scrollable overflow.** The `left`/`right`
   reveal variants translate +/-34px while pending, which widened the document
   by ~17px at *every* breakpoint until the host got `overflow-x-clip`.

### Measuring overflow correctly (hard-won)
- Launch headless Chromium **at the target size**
  (`--window-size=390,844`) and pass `mobile: false` to
  `Emulation.setDeviceMetricsOverride`. With `mobile: true` the emulated
  layout viewport (426px) disagrees with `clientWidth` (390px) and produces
  ~35px of phantom overflow that no amount of CSS will fix.
- Scroll the whole page first: reveal animations only run on intersection, and
  pending transforms are exactly what you are measuring.
- To find the culprit, toggle each section's `display` and watch
  `documentElement.scrollWidth` ŌĆö cheaper and more reliable than eyeballing
  bounding boxes.
- `scrollW - clientW <= 1` is the pass bar (subpixel rounding).

**Known pre-existing overflow, NOT introduced by this work and NOT yet
fixed:** ~3px at phone width and ~57px at 768px, present on `/about`,
`/contact`, `/faq` and `/cart` alike (identical numbers), so it lives in the
shared shell ŌĆö the footer (`washi-panel`) and the footer link grid ŌĆö not in
any page. `main`'s decorative canvases are all `pointer-events-none` and were
excluded as suspects. Worth a dedicated pass; it is unrelated to the design
work above.

Verified: 100 tests pass, `tsc --noEmit` clean, lint 0 errors (10 `no-img-element`
warnings are intentional), `next build` green.

## Icons, favicon and the phone footer (2026-09-26)

### The tab icon was Next's placeholder the whole time
`src/app/favicon.ico` shipped `create-next-app`'s grey triangle (25931 bytes,
three raw-BMP entries plus one PNG). Confirmed by decoding it: the only colours
present were pure `0,0,0` and `255,255,255`. `src/app/icon.svg` was already the
hand-drawn panda, but browsers prefer `favicon.ico` when both are present, so
the placeholder is what actually showed. If a favicon ever "doesn't update",
decode the `.ico` before touching code ŌĆö a grayscale-only palette is the tell.

**Icons are generated, not hand-made:** `npm run icons`
(`scripts/generate-icons.mjs`, requires `sharp` ŌĆö now an explicit devDependency,
it was previously only hoisted in via Next). It writes `src/app/favicon.ico`
(16/32/48 PNG entries, hand-assembled because sharp cannot emit ICO),
`src/app/icon.svg`, `src/app/apple-icon.png` (180) and `public/icon-{192,512}.png`
from the single vector source `public/panda-logo.svg`. Re-run it when the mark
changes.

Two non-obvious constraints are baked into that script, both discovered by
looking at the output rather than assuming:

- **The mark must be inset to ~78% of the canvas.** The logo fills 95% of its
  bounding box, so at 16px it reads as a dark smudge edge-to-edge.
- **The plate must be ink, not rice.** The mark is a *white* panda on a
  transparent ground (drawn for the dark hero). On a cream plate the white
  circle vanishes and the 32px icon samples as 100% rice/white ŌĆö i.e. invisible.
  Ink plate + white mark is the only combination that reads on both light and
  dark tab strips.

`manifest.webmanifest` now ships the real PNGs (`any` + a separate `maskable`
entry) instead of pointing at `panda-logo.svg`, which has no safe zone for
Android's maskable crop.

### The footer is desktop-only now
`SiteFooter` carries `hidden sm:block` by request. Nothing is orphaned: the
header holds the nav + language switcher, and `/contact` lists every channel the
footer had. The phone-specific accordion (`MobileFooterSections` in
`mobile-footer.tsx`) became unreachable ŌĆö `sm:hidden` nested inside
`hidden sm:block` can never render ŌĆö so it was deleted along with its imports;
only `FooterSocial` remains in that file. **Watch for that pattern when hiding a
container:** a child breakpoint inside a hidden parent is dead code, and `tsc`
won't flag it.

### Hero stats and menu pills (same session)
Hero dropped the ETA and delivery-fee stats (`etaMinutes`/`deliveryFee`/
`freeOver`); it now shows dish count, rating, city, plus a direct-order line
(`home.heroOrderDirect`). The menu's dietary filter pills are gone ŌĆö no
catalogue row carries a diet flag, so every pill but "available" matched
nothing. Removed the dead `diet` query param and the orphaned dictionary keys
(`dietaryFilter`/`filter*`/`noMatchTitle`, `menu.availableNow`).

Careful when grepping for removed copy: `deliveryHint` ("{fee}, free over
{freeOver}") and the FAQ's fee sentence legitimately still mention the delivery
fee ŌĆö they render at checkout, not in the hero. Check the surrounding context
before "cleaning up" a match.

### ImageKit asset is unreachable
`https://ik.imagekit.io/fbwa3np7/IMG-20260922-WA0012.jpg` returns **404**, and so
does the account root ŌĆö the whole ImageKit URL endpoint is not publicly serving,
so that image cannot be used as a favicon or anywhere else. If the owner wants a
photo mark, the file needs uploading somewhere reachable (or into the existing
public `menu-images` Supabase bucket).

Verified: 100 tests pass, `tsc --noEmit` clean, lint 0 errors (10 intentional
`no-img-element` warnings), `next build` green. Live checks on the dev server:
`/favicon.ico` byte-identical to the generated file, `/icon.svg`,
`/apple-icon.png`, `/manifest.webmanifest`, `/icon-{192,512}.png` all 200;
`<head>` links favicon + icon + apple-touch-icon + manifest; footer
`display:none` at 390px and visible (339px tall) at 1440px; no ETA/fee in either
locale's hero, direct-order line present in both.

## Japanese removed from the app; the DB columns stay until deploy (2026-09-26)

Japanese is not a published language here (English + Arabic only), so the
`name_ja` field was removed from every app layer: `catalog.ts` column lists,
`validation/schemas.ts` (`nameJa`), `actions/admin.ts` (payloads + formData),
both admin forms, the dish/category subtitles, the menu search haystack, and the
Japanese-flavoured hero/editorial/About copy. `BRAND_SCRIPT_MARK` is now
Chinese-only (õĖŁĶÅ»); the cuisine identity comes from the live `cuisine_tags`.
Commit `0121084`; guarded by `tests/identity-script.test.ts`.

**The `categories.name_ja` / `menu_items.name_ja` columns were NOT dropped, on
purpose.** A `drop column` migration was written and applied, and it silently
broke production: the deployed Pages worker is built and published separately
from this repo, and that live bundle still selects `name_ja`. PostgREST answered
the unknown-column select with an error, `getPublicMenu` threw, and `/menu` fell
to its empty state ŌĆö **HTTP 200, no visible error, zero dishes**. The drop was
reverted (columns re-added nullable; the migration row was deleted from
`supabase_migrations.schema_migrations` so local and remote stay aligned), and
`src/lib/types/database.ts` was regenerated against the restored schema.

Order of operations for any future column removal here:
1. Deploy the app that stops selecting the column.
2. *Then* drop the column.

How the breakage was proven (worth reusing): create a real dish with the
service-role key, fetch `/menu` with `cache: "no-store"`, and grep the HTML for
the dish name. With the column dropped the name was absent; after re-adding it,
present. The empty state is indistinguishable from "no menu yet" by status code
alone, so a status check will not catch this class of bug ŌĆö assert on rendered
content. The live worker's bundles contain no `name_ja` string, which is why
grepping the served HTML for the column name proves nothing; the column list is
data passed to PostgREST, not a literal in the client bundle.

`panda-wok.pages.dev` responds with `cache-control: private, no-cache,
no-store`, so these probes read live output rather than a stale edge copy.

Verified after the revert: typecheck clean, 113 tests pass, lint 0 errors (9
intentional `no-img-element` warnings), `next build` green, and a live probe
confirms the deployed app renders a freshly created dish on both `/menu` and
`/menu/<slug>`. Cloudflare deploy credentials are not available in this
environment (`wrangler whoami` = unauthenticated, no `CLOUDFLARE_API_TOKEN`),
so the app change is committed but not yet deployed.


## The real menu is imported (2026-09-26)

`scripts/import-menu.mjs` + `scripts/data/panda-wok-menu.json` (the owner's CMS
manifest, committed verbatim). Live result: **10 categories, 53 dishes, 15
modifier groups, 57 options**, Arabic on every dish, EGP 20ŌĆō1560.

**The manifest is positional, and that is the whole difficulty.** It is a flat
export of the owner's sheet (200 non-empty rows, 89 priced). Reading it as "each
priced row is a dish" is wrong and produces 89 junk dishes named `chicken`,
`beef`, `no protein`. The actual grammar:

- A **priced row is the dish name**; the *unpriced* line after it is that dish's
  description. (So `Vegetables spring rolls (4 pieces)` + `mixed vegetables and
  glass noodlesŌĆ”` + `95` is one dish, not two rows.)
- A run of priced `no protein / chicken / beef / shrimp` rows after a
  `your choice :` marker are **variants of the dish above**, not new dishes.
  Stored as a `Choose your protein` group (min 1, max 1) with `price_delta` from
  the cheapest variant ŌĆö the sheet quotes absolute prices, the DB stores deltas.
  `Lo-mein` is 125/208/249/275 ŌåÆ base 125, deltas 0/83/124/150.
- `your choice :` followed by *unpriced* words (`steamed`, `fried`) is a free
  choice group; the sauces in `Main dishes` likewise.
- `your choice of X or Y with ŌĆ”` in a Box is **prose describing the dish**, not a
  choice ŌĆö it stays in `description_en`. Treating it as a group produced a
  one-option radio group with a 200-character label.

Every one of the 200 rows is accounted for, and the script refuses to write when
a row is unmatched or a slug collides. `--dry-run` prints the plan, counts and an
audit (missing Arabic, missing descriptions, Japanese-named dishes); `--apply`
refuses if `menu_items` is non-empty and rolls back its own categories on
failure.

Verified live after import: English and Arabic `/menu` render, `/menu/<slug>`
shows the protein group with `+EGP 83.00` deltas, home shows 53 dishes, and a
rolled-back `place_order` priced Lo-mein + chicken at **208.00** with the delta
snapshotted into `order_items.modifiers` (pickup, so no delivery fee; 14% tax ŌåÆ
237.12). Group limits are enforced server-side by `place_order`.

### Two things to raise with the owner

1. **Japanese-flavoured dishes are in the real menu**: Teriyaki noodles, Japanese
   teppan fried rice, Korean ramen fried rice, Spicy tomato ramen noodles, Sweet
   and sour & teriyaki meal (single/twin), Teriyaki Chicken/Beef Box, Teriyaki
   sauce ŌĆö 9 items. Chinese-only branding (the `õĖŁĶÅ»` mark) is therefore a
   *branding* choice, not a claim about the menu. Renaming them is the owner's
   call, so they were imported as written.
2. **`Main dishes` items are literally named `Chicken` and `Beef`** (333/378),
   with the sauce as the choice group. That is what the sheet says, but on a menu
   card "Chicken" alone reads oddly ŌĆö a rename (e.g. "Chicken with your choice of
   sauce") needs the owner's approval.

Also worth knowing: **`is_required` does not gate checkout.**
`add-to-cart-panel.tsx` auto-selects the first option when `min_select > 0 &&
max_select === 1`, so the customer is never stuck, but `place_order` only
validates `chosen >= min_select` when `is_required` is true. The imported protein
groups are min 1 / max 1 and *not* required, consistent with every other group in
the DB; making them required would be stricter but would change behaviour, so it
was left alone.



## Where the menu's weight actually is (2026-09-26, measured)

The menu "feels heavy" complaint was measured, not guessed. On the standalone
build with the real anon key baked in:

- `/menu` HTML is **382 KB**, of which **245 KB is the inline RSC flight
  payload** and 40 KB is inline SVG. There are **123 inline SVGs**, 104 of which
  are the same two icons (prep clock + view-dish arrow) repeated per card.
- **Zero dishes have an `image_url`.** The import never set one, so `DishCard`
  renders its `asanoha` "photo soon" placeholder on all 52 cards. Image weight
  is therefore not a factor in the current menu's slowness ŌĆö the card art path
  (`dishImageSrc`/`srcSet`/`fetchpriority`) is simply unused. Uploading real
  photos is the biggest *visual* win available, and the upload path is ready.
- All 52 dishes share `prep_minutes = 15`, so the clock chip is identical on
  every card. If per-dish prep is not real data, dropping it from the card is
  free weight and removes 52 identical chips.
- `/admin/menu` is only 58 KB with 1 SVG, so the *admin* menu is not heavy; the
  heaviness lives on the customer `/menu` payload.

What was actually changed: the two repeated icons are hoisted to module scope,
which cut the RSC payload 258 KB -> 245 KB. **Hoisting does not shrink the
rendered DOM** ŌĆö React still emits one SVG per card, so the 123 inline SVGs
remain. Do not expect a DOM win from that change.

Fixing the remaining payload means not shipping the full catalogue as HTML:
paginate `/menu` per category (each category already has its own `/menu/<slug>`
page), or render the grid client-side from a small JSON payload. Both change how
crawlers see the menu, so they need a decision, not a silent rewrite.

## Delivery-only and offers (2026-09-26)

- Pickup is gone: `place_order` rejects `fulfillment='pickup'` with
  `PICKUP_UNAVAILABLE`, and the timeline / order-detail / guide / FAQ / llms
  copy no longer mention it. Migration `20260926150000_offers_and_delivery_only.sql`.
- `offers` (threshold discounts) + `Admin -> Offers` CRUD. **Checkout applies
  the single best-saving offer, never stacked** ŌĆö the admin page says so
  explicitly because "two active offers" reading as "both apply" is the obvious
  and expensive misreading.
- `Pancit canton filipino noodles` was deleted outright (row + modifier group +
  stock link + image rows), not archived, at the owner's request. `menu_items`
  is 52 rows.

## Japanese removal ŌĆö what "removed" means here (2026-09-26)

Japanese was never a locale (`LOCALES = ["en","ar"]`). What was removed:
`name_ja` reads/writes everywhere, the admin "Name (Japanese)" inputs, and the
Japanese-flavoured hero/editorial copy. What remains, deliberately:

- `menu_items.name_ja` **column still exists in the DB**. The Pages worker is
  deployed separately and its bundle still selects `name_ja`; dropping the column
  while that bundle is live made `/menu` fail silently to its empty state. Drop
  it only after the app deploy, and in this order: deploy app -> verify -> drop
  column (the reverse order is the trap recorded in `391d667`).
- `.font-kana` is a **Chinese** script face, not Japanese ŌĆö `public/fonts/kana-mark.woff2`
  is a 928-byte subset covering exactly õĖŁ and ĶÅ», built by `npm run fonts`.
  Shippori Mincho via `next/font` used to ship a 189 KB stylesheet of 244
  unicode-range chunks for that two-glyph mark.
- The real menu still contains Japanese-*flavoured* dishes (teriyaki, teppan,
  ramen, Korean ramen rice ŌĆö 9 items). Those are the owner's wording, imported
  as written; renaming them is the owner's call.

## Deploy (2026-09-26, pushed 8f4b467)

Pushed `feature/panda-wok-platform` (0 behind / 11 ahead ŌĆö a clean fast-forward)
and the `Deploy Pages` workflow ran green (run on `8f4b467`, conclusion
`success`). **The `CLOUDFLARE_API_TOKEN` repository secret is set now** ŌĆö the
earlier "deploy step always fails" note is obsolete; the previous run
(`c0213adc`) had already succeeded. Push-to-deploy works, so `npm run
pages:deploy` is a fallback, not the only route.

Verified live on https://panda-wok.pages.dev after the deploy:

- `/`, `/menu`, `/about`, `/faq` = 200; `/checkout` = 307 (auth middleware, as
  designed). The 307 is expected for an anonymous visitor, not a failure.
- The free-delivery banner renders in **both** locales from the `announcements`
  rows: EN shows "Free delivery on every order", AR shows "ž¦┘äž¬┘łžĄ┘Ŗ┘ä ┘ģž¼ž¦┘å┘Ŗ ž╣┘ä┘ē ┘ā┘ä
  ž¦┘äžĘ┘äž©ž¦ž¬", and the Arabic page does **not** also render the English row ŌĆö the
  `getAnnouncements` `sort_order` dedup fix holds in production.
- No `15m` / `15 ž»` prep chip anywhere, confirming the prep-time removal
  reached the deployed bundle (a stale bundle was the failure mode last time).

## Menu photo upload ŌĆö the "crash" was a 1 MB framework cap (2026-09-26)

The fear that uploading a photo would crash the admin was a real defect, and it
had nothing to do with Supabase or the bucket:

- Next caps **server-action request bodies at 1 MB** by default
  (`serverActions.bodySizeLimit`). `uploadMenuImageAction` is a server action
  that receives the raw `File`, while the field and the `menu-images` bucket both
  advertise **8 MB**. So every ordinary phone photo (2ŌĆō5 MB) was rejected by the
  framework *before the action ran*.
- Reproduced and fixed in isolation. With the limit absent, a 2.43 MB PNG POST
  returns **HTTP 500 "Body exceeded 1 MB limit"** (`statusCode: 413`). With
  `experimental.serverActions.bodySizeLimit: "8mb"` the same POST returns 200,
  the object lands in `storage.objects` at 2,431,703 bytes, and the returned
  public URL serves **200** with the full byte count. Both test objects were
  deleted afterwards; the bucket is empty.
- The client now also wraps the action call in `try/catch/finally`. A *rejected*
  action (oversized body, dropped connection, stale deployment) previously left
  the button spinning forever with no message ŌĆö which is exactly what "it
  crashes" looked like. It now clears the spinner and shows a message. The blob
  preview URL is revoked on completion instead of leaking.

## The importer is insert-only ŌĆö re-running it duplicates the menu (2026-09-26)

`scripts/import-menu.mjs` uses `.insert()` on `categories`, `menu_items`,
`modifier_groups` and `modifier_options`. It is **not** idempotent, despite the
manifest's `import_instructions.idempotency_key: "external_id"` asking for an
upsert by `external_id`: `external_id` does not exist on any live table. Running
`--apply` against the live DB would insert a **second** copy of the whole menu
(another 10 categories / 53 items), because `categories_slug_key` /
`menu_items_slug_key` are per-tenant unique and the existing rows occupy those
slugs ŌĆö so it would either error on the first collision or duplicate whichever
rows do not collide.

Two further traps in that script, both of which bite on a re-run:

1. **It resurrects `Pancit canton filipino noodles`.** The owner had that dish
   deleted outright (row + group + options), and the dry run still plans it
   (`Pancit canton filipino noodles ŌĆ” Choose your protein(4)`), because the
   source manifest still contains it. A re-import undoes the deletion.
2. **`--dry-run` is the default and is not read-only-safe by accident.** It
   performs no writes, which is correct, but it also reports `unmatched rows: 0`
   and `(none)` under PROBLEMS for a plan that would duplicate the menu. Do not
   read a clean dry run as "safe to apply".

Re-importing is therefore a deliberate, destructive operation: back up first,
and decide whether to replace the catalogue or extend it. Do not run
`--apply` to "refresh" the menu.

## Drift: live menu vs the source manifest (2026-09-26, counted)

| | live DB | manifest dry run |
|---|---|---|
| categories | 10 | 10 |
| menu items | 52 | 53 |
| modifier groups | 14 | 15 |
| modifier options | 53 | 57 |

The difference is the deleted `Pancit canton filipino noodles` and its group and
options. Everything else matches, so the live menu is the manifest minus that
one dish ŌĆö the menu is **not** half-imported. The Chinese menu is already live;
"upload the Chinese menu" is done in the DB sense and the remaining work is
photos (0 of 52 items have an `image_url`).

## Japanese-flavoured dishes: content, not localisation (2026-09-26)

`menu_items.name_ja` and `categories.name_ja` are **0-filled** live, so nothing
Japanese is rendered from the database. `.font-kana` is a 928-byte **Chinese**
subset (õĖŁ, ĶÅ») and `.font-kana` is not Japanese at all. What remains is nine
Japanese-*named* dishes (teriyaki ├Ś4, ramen ├Ś2, teppan ├Ś1, Korean ramen rice ├Ś1,
teriyaki sauce ├Ś1) ŌĆö these are the owner's menu wording, not UI localisation, and
renaming them changes the product. Treat "remove Japanese" as satisfied at the
localisation layer and ask the owner before touching dish names.

## Menu weight: the real cause is the RSC payload, not images (2026-09-26)

Restating because it keeps coming up: `/menu` ships **382 KB of HTML, 245 KB of
which is the inline RSC flight payload**, with **123 inline SVGs** (104 of them
the same two icons repeated per card). Images contribute **nothing** today
because no dish has one. Reducing weight means not serialising all 52 dishes
into every `/menu` response ŌĆö paginate per category or render the grid
client-side from a small JSON payload. Both change what crawlers see, so they
are an owner decision, not a silent rewrite.




## Notifications, team chat and the ops shell (2026-09-26, commit 39a77d8)

### The staff bell was silently dead ŌĆö passcode sessions have no `auth.uid()`
`notifications` gained an audience split plus `list_my_notifications` /
`count_unread_notifications` / mark-read RPCs that filter on `auth.uid()`. But
**the ops console is unlocked with a passcode, not a Supabase session**, so
`auth.uid()` is null there and every call returned `[]` / `0`. The bell looked
permanently clean rather than broken, which is the same silent-empty failure
mode as the `security_invoker` ratings view.

Fix: the four RPCs take an optional `p_user_id` and use
`coalesce(auth.uid(), p_user_id)`. The staff service resolves that id from the
gate cookie server-side (`getAdminSession().actorId`) and calls through the
service role. **The id never comes from the browser**, so a staff member cannot
read another's feed.

Two traps hit while writing this:
1. Guarding the explicit id with `current_user = 'service_role'` **does not
   work**: inside a `SECURITY DEFINER` function `current_user` is the function
   *owner* (`postgres`), not the invoker. The guard was always false and the
   bell stayed empty (verified: 4 rows present, RPC returned 0).
   `coalesce(auth.uid(), p_user_id)` is the correct rule on its own, because a
   session always pins the caller to their own uid.
2. Probe with `set local role service_role` in a rolled-back transaction ŌĆö
   `count_unread_notifications('staff', <uuid>)` must return the real count
   while the no-id form returns 0. That pair is the regression test.

### Team chat is separate tables, on purpose
`conversations`/`messages` are customer-owner-scoped (`conversations.user_id`
FKs a customer, RLS is `auth.uid()`-based). Reusing them for staff-to-staff chat
would need either a leak-prone policy rewrite or misuse of the customer column,
so `team_threads` / `team_thread_members` / `team_messages` are new, with
staff-only policies. One channel auto-joins every active staff member (trigger
on `staff`), and DMs are deduped by an order-independent participant slug
(`dm:<least>:<greatest>`) so opening a DM twice never forks the thread.

Team chat is **not** on Realtime: the console has no anon key to open a channel
with, so it refreshes the server component after a send instead.

`lib/actions/team-chat.ts` and `lib/actions/notifications.ts` deliberately
authorise via the gate (`assertCapability` / `getAdminSession`) rather than RLS,
for the same no-`auth.uid()` reason.

### Admin shell: `max-lg:` for the drawer
The mobile nav was a `hidden`/`block` full-height block that pushed page content
down the phone screen. It is now an off-canvas drawer (`max-lg:fixed
max-lg:inset-y-0 max-lg:start-0` + `max-lg:-translate-x-full
rtl:max-lg:translate-x-full`) with a backdrop, Escape, scroll lock and focus
move. Closing on navigation is done in each link's `onClick`, **not** an effect
watching `usePathname` ŌĆö that pattern is a lint error
(`setState` in an effect) and a cascading render.

Same pattern for the bell's server re-sync: compare the props against a
`useState` holder during render and `setState` there, instead of an effect.

## Live menu state after the Japanese import (2026-09-26, counted)

The menu now holds **two** catalogues, and they are numbered the same way, which
is the confusing part:

- **Chinese menu (imported later, 52 rows, `external_id is null`)**: 10
  categories `sort_order 0-9` (Appetizers, Noodles, RICE, Main dishes, Set menu,
  Fasting Meal, Special Offers, Box, Extra sauces, Drinks). EGP 20-1560.
- **Japanese sushi menu (`20260927070000_japanese_sushi_menu.sql`, 38 rows,
  `external_id is not null`)**: 8 categories `sort_order 10-17` (RAW/FRIED URA
  MAKI, NIGIRI RAW/FRIED, COMBO FRIED/RAW, SALADS, Sauces). EGP 35-1540.

Totals live: **18 categories, 90 items, 14 modifier groups, 53 options, 0 items
with an image, 0 missing Arabic**. So the answer to "we still need the Chinese
menu / the Japanese one" is: *both are in the database*. What is not done is
photos (0 images on 90 items) and there is no bulk importer for an arbitrary
sheet ŌĆö the admin CMS is the only entry point, one dish at a time.

### The Japanese seed is idempotent, unlike `scripts/import-menu.mjs`
`20260927070000_japanese_sushi_menu.sql` keys on `menu_items.external_id` (plain
unique index; a partial index would break `ON CONFLICT` inference) and upserts,
so re-running it is safe. `scripts/import-menu.mjs` still uses `.insert()` and
must never be re-run to "refresh" ŌĆö see the note above.

## Admin UX + chat + service keys (2026-09-26, session 7)

### Customer chat existed but was unreachable (fixed)
`/(site)/chat` had been complete for a while ŌĆö inbox, thread, realtime, server
action ŌĆö and was linked from **nowhere**: no header entry, no bottom-nav tab, no
account shortcut. The feature was built and invisible. It is now the `nav.messages`
tab in the mobile bottom nav, a header link for signed-in desktop users, and an
account shortcut. The bottom-nav slot it took was `feedback`; feedback is still
reachable from the header and `/contact`.

**Lesson:** a route returning 200 is not a shipped feature. Before declaring a
customer feature done, grep the customer chrome for its href.

### Admin is phone-first now
`AdminBottomNav` (`src/components/admin/admin-bottom-nav.tsx`) renders the first
four capability-permitted entries of `ADMIN_MOBILE_NAV` plus a "More" button that
opens the existing drawer. Below `lg` only; the desktop sidebar is unchanged. The
admin `<main>` gained `pb-24` on small screens so the bar never covers the last
row. Four tabs + More is the deliberate ceiling ŌĆö more targets on a phone makes
each too small to hit.

### One chat hub, three routes collapsed
`/admin/chat` is now a two-tab screen (Customers / Team) with combined unread
badges. `/admin/messages` and `/admin/team-chat` are `redirect()` stubs to the
right tab so existing links and notifications keep working ŌĆö do not delete them
without checking notification deep-links. `ADMIN_NAV` lost the duplicate
"Messages"/"Team chat" entries.

### Service API keys (already secure, now discoverable)
The AI centre already had the whole chain: `ai_providers.secret_ref` names a key,
`saveAiSecretAction` writes it into Supabase Vault via `set_ai_secret`,
`resolveDbProvider` -> `resolveSecretValue` reads env first then Vault, and
`listAiSecretHints` returns only a masked hint. It was simply buried. Now "API
keys" sits directly under the provider chain and "Add a key" opens a service
picker (Cloudflare Workers AI, OpenRouter, OpenAI-compatible, Gemini, Anthropic)
that fills the exact variable name; custom names still typeable. Cloudflare
Workers AI works either keylessly through the `workers/ai-api` binding or with an
account API token ŌĆö both paths exist in `provider.ts`.

`Field` gained optional `value`/`onChange` (state-driven input). It stays
uncontrolled when neither is passed, so no existing caller changed behaviour.

### Verified
`tsc --noEmit` clean; lint 0 errors / 11 warnings; `next build` green; dev smoke:
`/` and `/menu` render `href="/chat"` and a Messages tab, `/admin` 200 (passcode
gate), `/admin/team-chat` 200 (redirect). 140 tests pass; 3 test *files*
(`ai-chain`, `ai-live`, `skill-sources`) fail to load without `.env.local` ŌĆö a
pre-existing sandbox-only condition, identical on a clean tree.

**Deploy still blocked:** `CLOUDFLARE_API_TOKEN` is not in this environment and
the repo secret remains unset. Manual: `CLOUDFLARE_API_TOKEN=ŌĆ” npm run pages:deploy`
(branch `feature/panda-wok-platform` is the production branch).

## Charts and the live two-menu state (2026-09-26, session 8, commit 5baa2fa)

### Chart.js replaced every hand-rolled visual
The admin overview and analytics pages used div-based bars and plain number
walls. They now share `src/components/charts/*` (trend, donut, bar-list, gauge,
radar, heatmap, sparkline) plus `stat-card.tsx`. `register.ts` is the single
registration point; `chart-utils.ts` bridges the existing literal CSS tokens
into Chart.js colours so the charts inherit the brand rather than a new palette.
`react-chartjs-2` is the React binding.

**The bug today that tsc and `next build` both approved:** the radar needs
`RadialLinearScale` + `RadarController` registered. Without them the page
compiles, builds, and then throws at render with `"radialLinear" is not a
registered scale.` ŌĆö a browser-only failure caught by the error boundary, not by
any static check. Register those two alongside the rest.

**How to verify a chart change:** `tsc`, lint and the build are necessary but
blind to Chart.js runtime wiring. Render every chart with real values through a
throwaway route, load it in a browser, and confirm both that the `<canvas>`
elements exist and that nothing logged `not a registered`. The server HTML can
contain 7 canvases while the client throws on the first paint of one of them,
which is exactly what happened.

Empty-DB caveat: the dashboard trend/heatmap/radar sit behind `noData`, so on
the current (zero-order) live data they are *not* exercised. Do not read a clean
`/admin` as proof the charts work ŌĆö test with data.

### The menu is TWO catalogues, and BOTH are public
The DB holds 18 categories / 90 items, and **both** catalogues are live on
`/menu`. Neither is hidden and neither is to be disabled ŌĆö this is the owner's
menu.

- **Chinese menu.** 10 categories `sort_order 0-9` (Appetizers to
  Drinks), 52 items, `external_id is null`.
- **Japanese sushi menu.** 8 categories `sort_order 10-17` (RAW URA
  MAKI to Sauces), 38 items, `external_id` set (`menu-item-N@I`).

**Rule to keep: do not hide or disable the owner's menu on an assumption.** Both
catalogues are meant to be visible together; flagging any of it off is a change
the owner has not asked for. Hiding is reversible, but it is still a change ŌĆö only
flag content off on an explicit instruction, and flag rather than delete. See
`docs/data-safety.md`.

**Photos are the real gap, not content:** 0 of 90 items have an `image_url`.
That is the one menu job that genuinely needs doing, and it is per-dish in the
admin (the ImageKit endpoint is unreachable, so use the `menu-images` bucket
upload, not a pasted URL).

Prices live in `menu_items.price` (EGP, `numeric`); nothing is invented for
display. Apps/mains are single-word rows ("Chicken", "Beef", "Meal 1") ŌĆö if they
need descriptive names that is an owner edit in the CMS, not a re-import
(`scripts/import-menu.mjs` is insert-only and would duplicate the catalogue).

### CMS entry points (unchanged, verified)
`/admin/menu` = dish list + editor in one route (`?edit=<id>`); `/admin/categories`
= category list + form, owns ordering. Both gate on `menu.manage`, both write
through `src/lib/services/admin-catalog.ts` and `src/lib/actions/admin.ts`.
Images: `uploadMenuImageAction` (bucket `menu-images`, <=8 MB) or a pasted URL.

## Admin redesign: calm surfaces, dialogs, sound, KDS (2026-09-26, session 9)

Brief: the console must be clear, clean, less decorative, easier, in Arabic; the
KDS smoother with more animation, smooth scrolling, SweetAlert and a sound alert.

### Surfaces are neutralised in one place
`globals.css` has an `.admin-scope` block that flattens `.washi-panel`,
`.washi-paper`, `.washi-banner`, `.glass-*`, `.hero-night`, `.page-sheet` to a
single white panel, and strips `.asanoha` / `.asanoha-light` / `.bamboo-frame`
textures and the sway/leaf/drift animations. `AdminShell` opts in by adding the
class to its root div. **To restyle the whole console, edit that one block ŌĆö do
not hunt for decorative classes per page.** The customer site is untouched.

### A real dialog replaces the two-tap confirm
`ui/confirm.tsx` provides `ConfirmProvider` + `useConfirm()` ŌåÆ `confirm()` /
`alert()` (promise-based). Mounted in `app/layout.tsx` inside `ToastProvider`.
`AdminButtonAction`'s `confirm` prop now opens this dialog instead of relabelling
the button to "Confirm?", so nothing changes under the cursor mid-click. Tone,
focus, Escape and backdrop-to-cancel are handled. Use `useConfirm()` for any new
destructive action; do not add `window.confirm`.

### Sound is admin-only, and that is enforced by imports
`lib/sound/ting.ts` synthesises a two-note "ting ting" with WebAudio (no asset).
The only importer is `admin/kitchen-board.tsx`. The standing rule holds: **the
customer site is silent ŌĆö never import this under `(site)`.** The preference is
a subscribable store read via `useSyncExternalStore` (not an effect) and stored
in `localStorage` under `panda-wok.admin.sound`.

### KDS
`admin/kitchen-board.tsx` holds realtime + 12 s fallback polling, the arrival
diff (new fresh-order ids ŌåÆ chime + toast + header pulse) and the Motion tickets.
The page stays a server render and passes `signature` (comma-joined fresh ids).
Tickets are `motion.li` with `layout`, so reorders slide. Copy is `kds.*` in the
dictionaries (en + ar).

### Two traps hit here
1. **Hyphenated dictionary keys must be quoted.** `crm-activity: "ŌĆ”"` is invalid
   TS; write `"crm-activity": "ŌĆ”"`. `tsc` catches it, but only after you add it.
2. **`tsc`, lint and `next build` cannot see a browser-only failure** (the
   earlier Chart.js radar bug is the canonical example). For anything animated,
   sound-driven or canvas-based, render it and check the browser; static checks
   are necessary, not sufficient.

### Admin i18n status
Shell chrome, nav, groups, roles and the KDS are translated (follows the locale
cookie). **Screen bodies are still English-only** ŌĆö orders, CRM, settings, menu
forms, etc. Translating those is the next chunk of the Arabic task, screen by
screen against the `admin.*` dictionary namespace.



## Agent grounding, Arabic-first admin, MCP presets (2026-09-26, session 10, commit 8edcd31)

### The agent can no longer state a number no tool returned
`src/lib/agent/grounding.ts` is the guard; `finaliseAnswer` in
`conversation.ts` is where it is applied. Every `ok` tool observation is
collected, and if the model's prose cites a money figure or a bare number >= 1000
that appears in none of them, the prose is **withheld** and replaced with the raw
tool summary plus a notice. Small counts (weekdays, "3 steps") and 4-digit years
(1900-2200) are deliberately exempt so ordinary Arabic sentences are not eaten.
Arabic-Indic digits are normalised to ASCII before matching. A prompt asks the
model to behave; this makes the guarantee. Covered by `tests/agent-grounding`
and `tests/agent-finalise`.

Mid-loop provider failure is now surfaced: `providerError` is recorded and
`NO_MODEL_MESSAGE` is prepended, so a partial transcript cannot read as "there
was no data". The real live cause of the "fake revenue" complaint was the LLM
inventing figures in chat, not the metrics: live revenue is genuinely 0 because
the 3 live orders are all canceled/rejected/failed, and metrics only sum
`finished`.

### Admin defaults to Egyptian Arabic (storefront untouched)
`getAdminLocale()` in `src/lib/i18n/server.ts` resolves cookie -> saved
`profiles.locale` -> **Arabic**, and deliberately does **not** consult
`Accept-Language`. This is the trap that was hit: an English browser still sends
`accept-language: en`, so an Accept-Language fallback keeps the console English
for the very people it is meant for. The storefront keeps `getLocale` and its
English fallback. `admin/layout`, `admin/page`, `admin/denied`, `admin/kitchen`,
and all three `admin/agent/*` pages now call `getAdminLocale`; the gate form and
shell carry `dir`/RTL. The chat suggestions and both agent prompts (interactive
`conversation.ts` SYSTEM_PROMPT and the scheduled `ops-agent.ts` analyst) are
Egyptian Arabic. `crm-activity`-style quoted keys still apply.

### MCP connectors are presets, not installs
`src/lib/agent/mcp-presets.ts` exports Meta Ads, GitHub and Supabase with
endpoint, transport, auth header, `secretRef` (**a name, never a value**) and a
docs link. The picker in `mcp-server-manager.tsx` prefills the form; the owner
still pastes the token, which goes to Vault via `set_ai_secret`. GitHub uses the
PAT path because the hosted OAuth path needs a Copilot licence.

**Dictionary-path bug fixed:** the manager called `t("admin.mcp.*")` while the
keys live at `admin.agent.mcp.*`, so `catalogTitle` etc. rendered as raw key
strings. `tsc` cannot catch this (the dictionary is typed as a whole and `t()`
accepts any string) ŌĆö the same failure mode as deleted keys. Grep the rendered
page for `admin\.` when adding admin strings.

### Verification pitfalls hit here
`next start` warns and does not honour `output: standalone`; serve with
`node .next/standalone/server.js`, or verify admin pages on `npm run dev` with a
forged passcode cookie
(`createHmac("sha256", "Panda2026:panda-wok-gate").update("open:admin")`).

### Live menu (unchanged by this session, counted)
18 categories / 90 items across two catalogues: the Chinese menu (10 cats,
`external_id is null`) and the Japanese sushi menu (8 cats, `external_id` set).
**Both are public and must stay visible.** 0 of 90 items have an image ŌĆö photos
are the real remaining menu job, uploaded one dish at a time to `menu-images`.

## Menu import: current truth and the safe path (2026-09-26, session 10)

Corrections and additions to the older "drift" and "no bulk importer" notes
above, which predate the Japanese sushi import:

**Live menu now is 18 categories / 90 items**, counted live:
- Chinese menu: 10 categories (`sort_order 0-9`), 52 items, `external_id is null`.
- Japanese sushi menu: 8 categories (`sort_order 10-17`), 38 items,
  `external_id` set (`menu-item-N@I`).
Both are enabled and public. The older table (10 cats / 52 items) describes the
Chinese catalogue alone ŌĆö do not read it as the whole menu.

**There is still no bulk import into the DB.** Two different scripts exist and
neither is the right tool for a new sheet from the owner:
- `scripts/import-menu.mjs` (sheet manifest) is **insert-only** and refuses to run
  while `menu_items` has rows (it exits: "menu_items already holds 90 rows").
  It keys on nothing, so it cannot update an existing dish.
- `20260927070000_japanese_sushi_menu.sql` **is** idempotent: it upserts on
  `menu_items.external_id`. It is the one safe re-runnable seed.

**Uniqueness available for a safe upsert (verified live):**
- `categories.slug` UNIQUE, `menu_items.slug` UNIQUE, `menu_items.external_id`
  UNIQUE (plain unique index, so `ON CONFLICT` infers it).
- `modifier_groups` and `modifier_options` have **only** a primary key ŌĆö no
  natural key. Re-syncing options needs a name match or a delete-and-recreate per
  dish, or a sheet-supplied key added upstream.

**Recommended path for "upload the Chinese menu + prices" (not yet built):**
a Sheets/CSV importer that upserts `categories` by slug, then `menu_items` by
slug (or by `external_id` when the sheet supplies one), then reconciles each
dish's modifier groups by name. Preview the diff, then apply inside one
transaction. A paste-to-server-action route that carries the service role is the
wrong shape ŌĆö keep service-role work in a script, capability-gated work in the
admin action.


## Roll piece-count consolidation (2026-09-28)

- `supabase/migrations/20260928000100_roll_piece_options.sql` consolidates the six duplicated raw sushi roll pairs into one `menu_items` row per roll with a required `Piece count` modifier group and 4/8-piece options. It preserves the existing live prices (including Philadelphia 215/410 EGP) as a base price plus option delta; it does not invent the example price 419.
- The customer cart already snapshots modifiers into checkout payloads and order items. `src/components/customer/cart-provider.tsx` now keys quantity/removal operations by the full item-plus-modifier identity, so 4-piece and 8-piece selections cannot be merged accidentally.
- AI grounding now includes every live modifier option and its resolved price in `src/lib/ai/grounding.ts`; `skills.md` records the assistant rule to ask for piece count when missing and quote the exact live option price.

## Admin page localization (2026-09-28)

The locale switcher now changes the main admin page content, not only the shell. Orders, menu CMS, stock, CRM, loyalty, settings, offers, upselling, content, analytics and the AI centre use `admin.pages.*`; operational status labels use `admin.term.*`. Keep new admin copy in both `src/lib/i18n/dictionaries/en.ts` and `ar.ts`, and use `getT(getAdminLocale())` in server pages or `useT()` in client components.

## Rush resilience: edge cache + anonymous fast path (2026-09-29)

Two changes, both live on `panda-wok.pages.dev`, let the public site absorb a
traffic rush on the free plans. No menu data was touched.

### 1. Anonymous requests skip Supabase in middleware
`src/lib/supabase/middleware.ts` — `updateSession` used to call
`supabase.auth.getClaims()` on *every* request, including crawlers and
logged-out menu browsers, spending one subrequest per hit. It now checks for a
Supabase auth cookie first (`hasAuthCookie`) and returns immediately when there
is none. **The matcher is `sb-` + `-auth-token` as a substring, not a suffix:**
Supabase splits a large session across `...-auth-token.0/.1/...`, and an
`endsWith` check misses every chunked session and renders a signed-in customer
as logged out. Pinned by `tests/auth-cookie.test.ts`.

### 2. Edge cache for anonymous public pages
Cloudflare never cached this app — every customer page is `force-dynamic` and
Next sends `no-store`, so 100% of rush traffic reached the Worker and the
per-request CPU/subrequest cap (not the CDN) was the ceiling. The Pages front
door (`scripts/pages/_worker.js` + `scripts/pages/edge-cache.js`) now caches
anonymous document GETs to `/`, `/menu`, `/menu/*`, `/about`, `/contact`,
`/faq`, `/location`, `/privacy-policy`, `/cart` with `s-maxage=60`,
`stale-while-revalidate=300`, `stale-if-error=600`. Repeat visitors and
crawlers are answered by the CDN with no Worker invocation; a stale page is
served instantly while it revalidates.

Policy is narrow on purpose (a wrong "cacheable" leaks one visitor's page to
another): `/account`, `/checkout`, `/orders`, `/loyalty`, `/feedback`, `/chat`,
`/auth`, `/admin`, `/api` are never stored, and any request with a Supabase
session cookie or the `panda-wok.admin` cookie bypasses the cache, as do RSC,
prefetch, Authorization and the markdown-for-agents `Accept: text/markdown`.
The locale is part of the cache key (cookie then Accept-Language), so an Arabic
reader cannot be served cached English. `tests/edge-cache.test.ts` pins all of
it. The cached body is byte-identical to the uncached one; a catalogue edit is
visible once the TTL lapses (~1 minute), the deliberate trade for surviving a
rush.

**Debugging trap worth keeping:** `curl -I` sends HEAD, which the cache
correctly refuses, so a HEAD probe always looks like a miss and the `s-maxage`
header never appears. Verify with a real GET:
`curl -s -o /dev/null -D - https://panda-wok.pages.dev/menu | grep -iE 'x-edge-cache|s-maxage'`.
`x-edge-cache: HIT|MISS` says which side served it. `caches.default` **is**
available in Pages advanced mode (confirmed live).

### Supabase free-plan reality (verified against the docs)
Supabase does not offer a free "unlimited" tier, and its free quota is *smaller*
than the Worker problem we were chasing:
- **Egress (all services combined): 5 GB uncached + 5 GB cached / month.** Over
  quota -> grace period -> Fair Use restrictions: project **paused**, DB switched
  to **read-only**, or **402** on *all* API requests. That would take down
  checkout and admin, not just slow pages.
- **Realtime free**: 200 concurrent connections, 100 msg/s — a live-orders
  dashboard or broadcast to many roasters will hit this first.
- Free plan pauses idle projects (restore in the dashboard), 500 MB DB, 1 GB
  storage, 2 active free projects per org.

Therefore the *better* fix is to keep the expensive traffic off Supabase
altogether (edge cache + tiny column select), rather than looking for a more
generous free Supabase tier — there is none. If a paid tier is ever chosen,
Pro (250 GB + 250 GB egress) is the natural step and supersedes all of this.

### Edits are never stale: the worker purges its own cache
Next's `revalidatePath` clears only *Next's* cache, not the Worker's
`caches.default`. The Worker now sees every admin mutation (server actions POST
back to `/admin`), and on a non-GET under `/admin` it purges all cached public
pages via `ctx.waitUntil`, so an edit is visible on the next request instead of
at the TTL. Customer GETs never trigger a purge. The cache key uses a fixed
origin (`https://edge.cache.internal`) rather than the request host, so a page
has exactly one key regardless of host and the purge is deterministic. Verified
live: HIT -> admin POST -> MISS.

## Order realtime, and loyalty off by default (2026-09-29)

### The blank `supabase_realtime` publication was the whole bug
The customer tracking page subscribes to `order_status_history` INSERTs and the
KDS to `orders`. Both were dead because `supabase_realtime` contained **no
tables** (`select * from pg_publication_tables` came back empty). Realtime does
not error for an unlisted table — it reports `SUBSCRIBED` and then delivers
nothing, which is the nastiest possible failure: the client looks healthy.
Migration `20260929000100` adds `orders` and `order_status_history` to the
publication. RLS still runs per subscriber, so a customer only receives their
own order (`orders_owner_read` / `order_status_history_owner_read` are the only
SELECT policies). **Check `pg_publication_tables` first whenever realtime
"does nothing": `supabase_realtime` starts empty on every project.**

### A `SUBSCRIBED` socket must never switch polling off
Compounding the above: `order-status-realtime.tsx` and `kitchen-board.tsx` both
only polled while `live === false`, and `SUBSCRIBED` sets `live = true`. So the
silent socket disabled the fallback and the page froze until manual refresh.
Both now poll for the whole active life of the view regardless of socket state
(order 15s; KDS 12s, or 30s when the socket is up). The `live` flag is now
labelled a transport hint, not a guarantee.

### `order_status_history` is not loyalty state
`log_order_status()` also writes `order_status_history`, and a first pass gated
that insert on the `loyalty` flag — which would have re-broken tracking exactly
when loyalty is off (the default). History is always written; only points
accrual (`award_loyalty_on_finish`) and clawback
(`clawback_loyalty_on_failure`) are gated. Corrective migration
`20260929000200` restores the unconditional insert. Verified in a rolled-back
transaction: a status change writes history while the flag is false.

### Loyalty is off by default, and off now really stops it
`feature_flags.loyalty` is `false` (re-enable from the admin console). New
`setting_flag(key, default)` helper (execute revoked from `anon`/`authenticated`)
is what the triggers consult. `place_order` became a thin guard wrapper: the
original body is renamed `place_order_internal` (execute revoked, signature and
callers unchanged) and the wrapper raises `LOYALTY_DISABLED` (22023) for a
redemption while the flag is off. Checkout hides redemption when the flag is
off, so the customer never reaches that rejection. `LOYALTY_DISABLED` copy is
in both dictionaries.

## i18n usage test catches the raw-key class of bug (2026-09-26)

`tsc` cannot catch a `t("some.key")` call whose key does not exist: the dictionary
is typed as a whole object and the lookup accepts any string, so the call renders
the key path itself ("contact.faqHeading") to the visitor, only at runtime.

`tests/i18n-usage.test.ts` scans every literal `t("...")` in `src/app` + `src/components`
and asserts each resolves to a real dictionary key. It found, fixed, and locked:

- contact page rendered raw `contact.faqHeading` / `contact.faqSubtitle` (keys never existed)
- admin automations form rendered every label raw — the keys live under
  `admin.agent.automations` but the component looked up `admin.automations`
- `/orders/[orderId]` rendered raw `orders.delivery`
- feedback form rendered raw `feedback.orderLabel`
- the contact page hardcoded its "Where we cook" and "Ordering and delivery"
  sections in English while `contact.whereHeading` / `orderingHeading` / etc.
  already existed in the dictionary (so Arabic showed English there)
- the route loading skeleton's `sr-only` text was hardcoded English

Dynamic keys (`t("admin.nav.${x}")`) cannot be scanned statically; the families
they belong to are kept complete by the `Dictionary` type + `tests/i18n-parity.test.ts`.
When adding a dynamic family, keep both dictionaries in lockstep or the parity
test and `tsc` will fail.

The customer mobile drawer (`MobileNav`) and the bottom tab bar were audited live
(headless Chromium at 320-414px, both locales): fully translated, and
`documentElement.scrollWidth - clientWidth == 0` on every customer page in both
locales. There is no customer sidebar — "the mobile sidebar" is the `MobileNav`
sheet. The admin console drawer is `src/components/admin/admin-shell.tsx`.

## Menu system (verified 2026-09-26)

Live catalogue is NOT empty: 18 categories / 84 dishes / 20 modifier groups /
65 options (supabase project xjbtsryidznsxqlynmfa). 76/84 dishes have an image,
67 have descriptions.

- Tables (`supabase/migrations/20260922000200_menu.sql`): `categories` (name_en/ar/ja,
  slug, sort_order, is_enabled), `menu_items` (name_en/ar/ja, slug, prices, flags,
  allergens[], image_url), `menu_images`, `modifier_groups` + `modifier_options`,
  `upsell_rules`.
- Admin CMS: `/admin/menu` + `/admin/categories` (one dish at a time), backed by
  `menu-item-form.tsx` / `category-form.tsx` with direct image upload to the public
  `menu-images` Storage bucket (`src/lib/actions/storage.ts`).
- Bulk path: `npm run menu:export` (live -> `scripts/data/menu-export.csv`), edit,
  `npm run menu:import` (dry run) / `menu:import:apply`. Idempotent; matches on
  `external_id` then `slug`; never deletes. Columns in scripts/data/README-menu-import.md.
- `scripts/data/panda-wok-menu.json` is an import manifest derived from `newwebsitemenu.pmdx`
  (10 sections / 89 priced items), largely the same catalogue already live.

Open question for the owner: the Chinese sections (Appetizers, Noodles, RICE,
Main dishes, Set menu, Fasting Meal, Special Offers, Box, Extra sauces, Drinks)
are already loaded with Arabic names and prices; the Japanese sushi sections
(RAW/FRIED URA MAKI ROLL, NIGIRI RAW/FRIED, COMBO RAW/FRIED, SALADS, Sauces) are
also live. "Upload the Chinese menu" needs confirming — replace prices? add dishes?
add Japanese names? add per-dish modifiers?

### Catalogue state, verified live (2026-09-26) — answers the open question above

Re-counted against the live DB (`xjbtsryidznsxqlynmfa`): **18 categories, 84
menu_items, 20 modifier_groups, 65 modifier_options, 5 orders.** Every dish has an
Arabic name and a price; 73 of 84 carry an image. The two earlier "0 rows" notes in
this file are historical and were corrected in place — do not describe the menu as
empty.

- **Chinese menu** — 10 sections, 52 dishes, sort_order 0–9 (Appetizers 9, Noodles
  10, RICE 5, Main dishes 2, Set menu 6, Fasting Meal 2, Special Offers 3, Box 8,
  Extra sauces 5, Drinks 2).
- **Japanese sushi menu** — 8 sections, 32 dishes, sort_order 10–17 (RAW/FRIED URA
  MAKI ROLL 6+6, NIGIRI RAW/FRIED 3+3, COMBO FRIED 4, COMBO RAW 5, SALADS 2,
  Sauces 3). Loaded by `20260927070000_japanese_sushi_menu.sql`, keyed on
  `menu_items.external_id` (`menu-item-N@I`), so it is idempotent.
- **So "upload the Chinese menu" is already done** — both catalogues are live
  together on `/menu`, per the standing rule that neither is ever disabled.
- **4-piece/8-piece rolls are ONE dish each, not two.** The import first stored
  both prices as separate rows; `20260928000100_roll_piece_options.sql` (remote
  name `roll_size_options`) collapsed each pair into one item whose **base price is
  the 4-piece price**, plus a required single-select `Piece count` modifier group
  (`4 Pieces` +0, `8 Pieces` +delta). Six rolls: Philadelphia 215, California
  Caviar 205, Hanami 215, New Style Philadelphia 215, Dynamite 215, Veggie Cheese
  150. `place_order` prices modifiers from the live DB, so the option stores only
  the delta. `20260928000200_roll_options_ai_prompt.sql` teaches the assistant to
  ask which piece count the customer wants.
- **Import round trip is a verified no-op:** export -> copy to
  `scripts/data/menu-import.csv` -> `npm run menu:import` reported *0 new
  categories, 0 new dishes, 0 updates, 84 unchanged, no problems*. The pipeline is
  therefore trustworthy for a real edit. Both sheet files are gitignored.
- `scripts/import-menu.mjs` is the **older insert-only** loader (refuses to run once
  the table is populated) — it is not the tool for updating an existing menu.
- Standing rule unchanged: **no agent writes menu rows unless the owner asked for
  that exact change.** The price sheet is the owner's to fill in; hiding via
  `is_available`/`is_enabled` is the reversible alternative to deleting.

## Ops agent: it was answering in English on purpose (2026-09-29)

The agent was never "not in Arabic". Its prompt has been Egyptian Arabic since
`8edcd31`; the prose was being thrown away after the model produced it.

**Defect 1 — the model's report was parsed and discarded.** `runOpsReport`
(`src/lib/agent/ops-agent.ts`) builds a prompt asking for an Arabic
`headline`/`summary`/`recommendations`, then read only `parsed.actions` from the
reply. `headline` and `summary` were computed *before* the model call from
`buildDeterministicInsights` — whose strings are English — and the model's own
wording was dropped on the floor. The stored run is the proof: `provider:
"workers-ai"`, four Arabic actions, English headline ("Not enough order history
for reliable patterns yet"). Nothing was misconfigured; the good output was
simply not read.

Fix: `pickGroundedReport()` (exported for tests) accepts the model's prose, but
only after the **whole reply** passes `findUngroundedFigures` against the
snapshot — the same figure-grounding guard the chat agent gets from
`finaliseAnswer`. An ungrounded reply is rejected whole and the deterministic
report stands, so switching to Arabic did not also open a path for invented
figures. Verified live: provider `workers-ai`, headline
"تحليل أداء المطبخ السحابي لم Panda Wok في مصر".

**Defect 2 — "about 19000% of finished revenue".** In `insights.ts`, the
category-concentration share divided `categoryMix[0].revenue` (summed over every
*non-cancelled* order) by `totals.revenue` (only *finished* orders), with
`Math.max(..., 1)` standing in for a zero base. A window with no finished
revenue but real item revenue therefore divided by 1. The share is now measured
against the mix total it was built from: same live data now reads "about 53% of
item revenue" (215 of 405).

`tests/ops-agent-report.test.ts` covers both. `InsightData` is now exported.

**Reports already had daily/weekly cadence** — `ops_agent_settings
.report_interval_hours` (24 = daily, 168 = weekly) plus `agent_automations`
`cadence: daily | weekly | monthly | interval`. No new scheduler was needed.


## Home hero photo + sakura (2026-09-29)

The home hero can carry an owner-supplied background photo. It is a **setting,
not a code path**: `brand.hero_url` (public) is read by `getPublicSettings` and
rendered by the hero. `brand.banner_url` was read but rendered nowhere — a dead
key; `brand.hero_url` is the one actually wired.

- **The admin surface already existed.** `listSettings` selects every row and
  `SettingsForm` groups rows by the prefix before the first dot, so adding the
  row is the *entire* admin work — no component, no page, no deploy. Verified:
  `/admin/settings` renders `<input id="setting-brand-hero_url">` prefilled.
- **Absence is meaningful.** The `<img>` and the wash render only when the value
  is set, and the hero's own lantern glows sit *behind* the photo layer, so a
  hero with no photo is pixel-identical to the pre-photo design. Clearing the
  value is a valid way to remove the photo.
- **ImageKit is a supported image host now.** `src/lib/images/responsive.ts`
  only rewrote Unsplash URLs, so an ImageKit hero was served raw (~285 KB) on
  every load. `imagekitSrc()` emits `?tr=w-<w>,q-70,f-webp,c-at_max`. `c-at_max`
  ("do not enlarge") is load-bearing: `w-1600` from a 941px original otherwise
  returns an upscaled 1600×2843 (191 KB) instead of the sharp 941×1672 (109 KB).
  Live variants measured: 400px 33 KB, 800px 88 KB, 1200px 107 KB.
- **The hero uses an `<img>`, not a CSS background.** A background cannot carry
  `srcSet`/`sizes`, and Next's optimizer is disabled site-wide
  (`images.unoptimized`), so the `<img>` + ImageKit CDN is the only way to ship
  a width-tuned WebP. `fetchPriority="high"`, `decoding="async"`,
  `alt=""`/`aria-hidden` (decorative), `object-cover object-[62%_64%]`.
- **Focal point is measured, not guessed.** The photo is portrait (941×1672) and
  the hero is wide. Row-wise detail analysis put the brightest subject at 62-84%
  of the height, so `object-position: 62% 64%` crops to the subject rather than
  the empty upper half.

### The legibility wash, and why it is breakpoint-aware
`globals.css` `.hero-wash` sits above the photo and below the copy. It has two
regimes because the hero's layout changes at `lg`:

- below 1024px the hero is one column and copy spans the full width, so the wash
  stays deep across it (165deg, 80%→68%→58% ink);
- at ≥1024px the copy takes the left column, so the wash opens to the right
  (100deg, 84%→58%→24%) where the photo's subject and the ringed plate sit.

`[dir="rtl"] .hero-wash` mirrors the angle (260deg), because in Arabic the copy
column is on the right and would otherwise sit on the open end.

**Contrast was measured on real rendered pixels, not the gradient maths.**
Screenshot at 1920×1080, background pixels only (anything below luminance 0.25):
median 0.004, p99 0.139, and the brightest background column at 66% across —
i.e. exactly where the wash opens. Cream headline measures **19.3:1** and the
body copy 15:1, both far above the 7:1 AAA bar. The photo reads as texture
(stddev 0.02) rather than being flattened to ink. This holds because the source
photograph is very dark to begin with (peak luminance 98/255) — a *bright* hero
photo would need a stronger wash, so re-measure if the owner swaps it.

`SakuraField density` went 0.7 → 1.15 (petals are drawn on a canvas above the
photo) and `LeafField2D` 9 → 11, so the sakura reads against the photo and not
just against flat ink. The site remains silent by design — no audio was added.


## Admin form text was invisible (2026-09-29) — 1.07:1 on every field

**Every form control in the ops console had cream text on a near-white field.**
Not a subtle low-contrast issue: `color: rgb(247,243,232)` (rice-100) on
`background: rgb(253,251,245)` (rice-50) = **1.07:1**, i.e. the labels a staff
member types into were effectively blank. It also hit **the gate form's own
passcode field**, so `/admin` could not be unlocked by anyone.

**Root cause is an inherited colour, not a bad class.** The customer shell sets
`body { background: ink-950; color: var(--foreground) }` where `--foreground` is
rice-100 (cream). The console's restyle (`792b841`) scoped `.admin-scope` with
`background-color: var(--color-rice-100)` and **never reset `color`**, so
everything inside the console inherited cream from `body`. `.input` and the
inline `bg-rice-50` fields then paired that cream text with a light background.
The defect is entirely inside the console — it was *not* introduced by the hero
work, and the customer surface was never affected.

**Fix (two layers):**
1. `.admin-scope` now sets `color: var(--color-ink-900)` — the console inverts
   the surface, so it must invert the text colour with it. This is the actual
   fix: 396 controls across 19 admin routes.
2. `.input` now sets `color` and `::placeholder` explicitly instead of
   inheriting, and the gate input carries `text-ink-900`. Belt-and-braces so a
   light field can never again take its text colour from a dark ancestor.

**How it was found, and the method worth reusing.** Eyeballing never surfaced
this; a computed-style sweep did. `scripts/`-style CDP harness (written to
`/tmp/sweep.mjs`): launch `chromium --headless=new --remote-debugging-port=9222`,
then for each route walk every `input,textarea,select`, composite the element's
background over its ancestors (so translucent/`bg-*` stacks resolve correctly),
and compare against `getComputedStyle().color` with the WCAG formula. It reported
`color`, effective background, ratio, and the offending class list. Run over
every route x {en,ar} x {1440,390}. Result: **19/22 routes broken before, 0 after**
(the `ar/1440` column was clean before only because the Arabic admin re-renders
after the sweep had already moved on).

Two traps this exposed, worth keeping:
- **`background-color` on a scope is not a theme.** If a container flips the
  surface but not the foreground, every inherited `color` silently points at the
  wrong palette. When scoping a dark app into a light console (or vice versa),
  set both or neither.
- **A shared `.input` class that omits `color` is a landmine.** It is correct
  only while every consumer happens to sit under an ink-text ancestor. State the
  colour explicitly.



## Hero photo is bare; the legibility wash was removed (2026-09-29)

The owner's call: **no shading on the hero photo at all — show it as it is.**
The `.hero-wash` overlay (and its four breakpoint variants) has been deleted
from `globals.css`, and the `<div class="hero-wash">` removed from the hero
markup in `src/app/(site)/page.tsx`. The `<img>` is now the only layer over the
`.hero-night` ground; nothing is composited on top of the photograph.

**This is a deliberate legibility tradeoff, and it is the owner's to make.**
Measured with the wash gone, the worst pixel under the headline is *pure
photographic white*:

| width | worst-pixel contrast (cream on photo) |
|-------|--------------------------------------|
| 390   | 1.08:1 |
| 768   | 1.05:1 |
| 1024  | 1.60:1 |
| 1440  | 1.17:1 |
| 1920  | 1.06:1 |

i.e. wherever a white highlight lands behind a glyph the text is unreadable
(1:1 = invisible). Roughly 1% of the hero area is that bright; the median is
still ~17:1 because the photo is mostly dark.

**Do not re-add a wash without asking.** If the owner later wants the copy
readable, the options are, in order of least damage to the photo:
1. a stronger crop bias (`object-position`) so the copy sits on the dark region;
2. per-text legibility (`color`, `text-shadow`) — *not* a surface overlay, so
   the photo stays untouched;
3. a localised gradient scrim behind the copy column only.
Note the whites are part of the artwork (a garnish/plate highlight), so unshaded
text over them is an accepted aesthetic choice, not an oversight.

**Still true and worth keeping:** the earlier "19.3:1" note was measured over
background pixels only (bright pixels were discarded as foreground), which threw
away exactly the highlights a wash must defend against. Any future contrast
measurement must sample the *worst* pixel under the text, not the average.
`/tmp/hero-measure.mjs` (CDP) is the tool; screenshot the hero with the copy
hidden, then read the pixels inside the heading's bounding box.



## Checkout was 100% dead: `place_order` had the wrong return type (2026-09-29)

**Every order failed.** The customer saw "something went wrong on our side" and
the kitchen saw cancelled orders; the live log showed
`POST /rest/v1/rpc/place_order -> 400` (3 times at 18:50).

Root cause, in `20260929000100_realtime_and_loyalty_default.sql`: the
`LOYALTY_DISABLED` guard was added as a thin wrapper, but the wrapper was
declared `returns uuid` while assigning the four-column table function into a
scalar:

```sql
v_result uuid;
v_result := public.place_order_internal(...);   -- returns table(...)
```

`place_order` is not `returns table`, so `v_result := fn(...)` does not *call*
the function — it reads the row as a whole and coerces the composite
`(order_id, order_number, total, reused)` to `uuid`. That type-checks while the
call is unresolved (which is why the migration applied cleanly) and fails at
**run** time:

    ERROR: 22P02: invalid input syntax for type uuid:
           "(5253bbb4-…,PW-2609-1043,680.00,f)"

The order row is inserted and the transaction then aborts, so no order ever
survived. `20260929190000_fix_place_order_return_type.sql` restores the table
return type and keeps the guard:
`return query select * from public.place_order_internal(...)`.

Verified live in a rolled-back transaction (the exact basket from the report,
2 × combo fried 8 pieces): returns `PW-2609-1045 / 340.00`. Also verified a
non-combo item (2 × combo 8 pieces, 696.00) and that the guard still fires —
a `points_redeem > 0` call while the flag is off still raises `LOYALTY_DISABLED`.

**Trap worth keeping: a scalar assignment from a `returns table` function is a
runtime error, not a compile error.** `create function` resolves the body
lazily, so the migration is green, `tsc` is green, and every request 400s. When
a wrapper changes a function's return type, assert the result with
`pg_get_function_result()` and call it once in a rolled-back transaction.

**Repro method** (no browser needed): `set_config('request.jwt.claims', …)` +
`set_config('role','authenticated',true)` inside `begin; … rollback;` gives a
real `auth.uid()`, so `place_order` can be exercised as the customer would.

## Loyalty is off, and now actually stops (2026-09-29)

`feature_flags.loyalty.is_enabled` is **false** live. Two customer-facing leaks
of a programme that is not running were closed:

- `checkout-flow.tsx` still rendered "You will earn {points} loyalty points on
  this order." The line is now gated on `loyaltyEnabled`, so no promise is made
  for points the kitchen is not honouring. (`place_order` still records
  `points_earned`; that is a database column, not a promise.)
- `SiteFooter` rendered `/loyalty` unconditionally — the header already gated it
  on the flag, the footer did not. The footer now takes `flags` and drops the
  link the same way. Account page shortcuts and `/loyalty` itself already
  respected the flag; `/loyalty` shows its "not available" empty state.

Note the `loyalty` flag gates **both** earning and redemption; the assistant's
grounding (`src/lib/ai/grounding.ts`) still states the earn rate regardless.
Spend lives in `loyalty_transactions` (ledger) + `loyalty_rewards` (thresholds)
— there is no single `redeem` table.

## Combo choices are option groups, not description prose (2026-09-29)

`combo-8-pieces` and `combo-fried-8-pieces` now carry a required single-select
**"Your choice"** group (migration `20260929180000`), so the customer picks the
roll instead of reading a note. Their descriptions lost the redundant
`your choice: …` clause (migration `combo_description_cleanup`) and keep the
rest of the text verbatim. The other combos (16/24/32/48 piece, raw and fried)
are **meal compositions, not choices** — their descriptions stay as written and
they get no group. Verified live in both locales: the group renders as radio
inputs on `/menu/combo-fried-8-pieces` and the old note is gone.

Live menu state: both catalogues public — Chinese (10 cats, `external_id is
null`) and Japanese sushi (8 cats, `external_id` set). Do not disable either;
hide with a flag instead.

## `Sold out` -> `Out of stock` (2026-09-29)

The owner preferred "out of stock" over "sold out". Changed in
`en.ts` (`dish.soldOut`, `addToCart.soldOutChoice`, `addToCart.unavailable`),
the admin menu `menu-item-row.tsx` badge and visibility option, and the
assistant grounding's option annotation so the agent's wording matches the UI.
Arabic was already `نفدت الكمية` (= out of stock) and is unchanged.

## Mobile hero copy is centred (verified live, 2026-09-29)

The home hero's copy column is `text-center lg:text-start`; measured on the
deployed page at 390px: `h1`, tagline, and CTA row all report
`text-align: center`, `documentElement.scrollWidth - clientWidth == 0` (no
horizontal overflow). At `lg` it returns to the leading edge because the
two-column layout puts the copy in one column. Note the hero *stats* strip
(`dl`) stays `text-start` at every width by design — it is a data table, not
copy.

## Ops agent deliverables (2026-09-29)

The ops agent can now *produce documents*, not only propose changes. Deliverables
render from the live database, are stored in the private `artifacts` bucket, and
are downloadable from Admin -> AI ops (signed URLs).

- `src/lib/agent/deliverables.ts` — seven kinds: `daily_sales`, `weekly_kpi`,
  `menu_engineering`, `stock_reorder`, `winback_draft`, `pricing_review`,
  `eod_reconciliation`. `createDeliverable()` opens an `agent_artifacts` row
  (`building`), renders, uploads, then marks it `ready`; a failure marks it
  `failed` with the message, so a crash is auditable rather than invisible.
- **Read them with the service client, never `createServerSupabase()`.** The
  first version called `listStockItems()`/`listAdminMenuItems()`, which read
  request headers; every render outside an HTTP request (the scheduled agent, a
  test) threw *"`headers` was called outside a request scope"*. A background
  agent has no request, so a deliverable must not depend on one.
- **The DB types are the contract.** `open_artifact`/`finish_artifact` take the
  run/actor ids as `uuid default null`, so the generated types mark them optional
  (`p_run_id?: string`). Passing an explicit `undefined` is what the optional
  signature wants; do not reintroduce a non-defaulted `uuid` parameter or the
  call fails typecheck again.
- **Do not chain `.catch()` on a PostgREST builder** — it is a thenable, not a
  real Promise, so `.catch` does not exist. Use `.then(ok, err)`.
- The agent proposes a `deliverable` action (`payload.deliverable` is one of the
  kinds); approving it renders and files the document. Read-only by design — a
  document never changes an order, price or menu. Constraint migration
  `20260929201000_agent_deliverable_action.sql` adds `deliverable` to
  `ops_agent_actions.kind`.
- Verified live: all seven kinds render against real data (menu engineering
  classified 4 selling dishes into stars/plowhorses), and the full
  create -> render -> upload -> list -> download -> delete cycle round-trips with
  zero leftovers in `agent_artifacts` or the bucket.

## Checkout tax actually shows 0 now (2026-09-29)

`getCheckoutConfig()` fell back to a hardcoded **14%** when `tax.rate` was not
readable, because `tax.rate` is not a public setting. After the rate was set to 0
the customer preview still showed 14% tax while `place_order` charged 0 — the
preview and the charge disagreed. It now reads the key through the **service
role** (`tryCreateAdminSupabase()`), falling back to the request client only if no
service key is configured, so the preview matches the authoritative value.

`delivery.fee` / `delivery.free_over` are live at 0 and are already public
settings, so they need no special read path; both are editable in Admin ->
Settings (verified by a set -> read -> revert round-trip).

## Task-based model routing, and the AI centre was invisible (2026-09-29)

### The AI centre silently showed nothing (fixed)
`/admin/ai` rendered "لا يوجد مزودون مسجلون" while five `ai_providers` rows were
live. Two independent defects, both the same class of silent-empty bug:

1. **`RunStatusBadge` called the client hook `useT()` from a server component.**
   `src/components/admin/run-status.tsx` is a server component (imported by
   `admin/ai`, `admin/ai/usage`, `admin/backups`, `admin/broadcast`,
   `admin/exports`, all server pages). With no usage rows the component never
   mounted and the page looked fine; the moment `ai_requests` had data it threw
   *"Attempted to call useT() from the server but useT is on the client"* and the
   whole `/admin/ai` render failed. Fixed: `RunStatusBadge` is now `async` and
   uses `await getT(await getAdminLocale())`. **A component that is neither
   `"use client"` nor obviously server-side is the trap — check its importers.**

2. **The AI tables are `has_role('admin')` RLS, but the console has no session.**
   `ai_providers`/`ai_prompts`/`ai_requests`/`ai_usage_daily`/`ai_knowledge_sources`
   and every `agent_*`/`ops_agent_*` table are `authenticated`-only, so a
   passcode-gate console (no `auth.uid()`) reads zero rows. **This is already
   handled centrally** — `createServerSupabase()` elevates any request whose
   `x-pw-path` header starts with `/admin` to the service role, and the
   middleware sets that header (and strips it everywhere else). So a service
   layer that calls `createServerSupabase()` is fine on `/admin`; the bug was
   purely the `useT()` crash, which aborted the render *after* the queries had
   returned. Do not "fix" these reads by switching to `tryCreateAdminSupabase()`
   — that was tried, verified unnecessary, and reverted.

### Routing
`ai_providers.routes` (jsonb, migration `20260929210000_ai_task_routing.sql`) is a
`{task -> priority}` map. `routePriority(row, task)` (exported from
`src/lib/ai/provider.ts`) returns `routes[task]` when present, else the row's base
`priority`; `buildDbProviderChain({rows,binding}, fallback, task)` sorts by it.
`AI_TASKS = ["chat","ops","agentic"]`. A missing task key means "eligible at the
base priority", so an untouched row behaves exactly as before and an empty `{}`
is the old single-chain behaviour.

Live routing (applied by the migration, ids resolved by name):
- `agentic` (hard, tool-using, documents) -> `gemini-free` first (10)
- `ops` (daily/weekly reports) -> `workers-ai` binding first (10)
- `chat` -> `openrouter-free` first when its key is present (10)
- `pollinations` keeps `{}` (shared free fallback at base priority 20);
  `deterministic` is fallback-only and stays the floor.
Callers tag their chain: `assistant.ts` -> `"chat"`, `conversation.ts` ->
`"agentic"`, `ops-agent.ts` -> `"ops"`.

Admin surface: `AiProviderForm` carries a **Routing** fieldset
(`route_chat`/`route_ops`/`route_agentic`), and each provider row in `/admin/ai`
shows its route badges plus an **Edit** `<details>` that mounts the form with the
row's current values. `parseRoutes()` in `lib/actions/admin.ts` keeps only
`AI_TASKS` keys with finite values (clamped 0-9999).
`tests/ai-task-routing.test.ts` pins the ordering contract with no network.


## Combo choices and per-option stock were already live (2026-09-29)

The two requests ("make the combo note real options" and "let admin mark a dish
out of stock / hidden, and a protein like shrimp out of stock") were **already
implemented and deployed** in `b23c45f`. Verified against the live DB, not the
code alone:

- **Combo choices are real radios, not note text.** `combo 8 pieces`
  (`65f8da1e...`) and `combo fried 8 pieces` (`ac5bec4b...`) each carry a required
  `Your choice` group (min 1 / max 1) with two options. The customer page emits
  `<input type="radio">` per option, and the group is also written as a
  `modifier_group` in the RSC payload. The "note" the owner saw in the sheet
  became the group; the dish `description_en` is just the base roll.
- **Protein choices exist too.** Four groups live: `Choose your protein`
  (44 options / 11 dishes, includes shrimp/beef/chicken/no-protein),
  `Size` (12 / 6 rolls), `Choose your style` (9 / 3), `Your choice` (4 / 2).
- **Out-of-stock is enforced by `place_order`, not the label.** Rolled-back
  transaction proof: with one option of `combo 8 pieces` flipped
  `is_available = false`, ordering it is refused (`VALIDATION:combo 8 pieces`)
  while its available sibling is accepted. The client also greys the option and
  shows `dish.soldOut`; a required group with every option unavailable blocks
  the add entirely (`addToCart.soldOutChoice`).
- **Three-way dish visibility** already exists: `live` / `sold_out`
  (`is_available=false`) / `hidden` (`is_archived=true`), via
  `setMenuItemVisibilityAction`. Hide, never delete -- the row, its translations
  and its images stay.

### The one real gap: the controls were hardcoded English
`menu-item-row.tsx` and `modifier-editor.tsx` had no `useT()` at all, so in the
Arabic-first console the visibility radiogroup, the option "In stock" switch and
every group/option form label rendered in English. Fixed in `249c5eb` by reading
`admin.pages.menu.*` and `admin.pages.optionsEditor.*` from both dictionaries.
Verified live in dev with a forged gate cookie (`panda-wok.admin` =
`createHmac("sha256","Panda2026:panda-wok-gate").update("open:admin")`):
`/admin/menu?edit=65f8da1e...` renders the Arabic options editor and the Arabic
`نفدت الكمية` state; English renders `Live / Out of stock / Hidden / Copy / Hide`.

Wording is already the owner's preference: EN "Out of stock" / AR "نفدت الكمية".

Note the two conditional strings that are legitimately absent from a static
fetch: `saving` only shows during a save, `restore` only for an archived dish.

`tests/i18n-usage.test.ts` + `i18n-parity.test.ts` pass (they catch the
raw-key class of bug); full suite 266 passed / 2 skipped; `tsc` clean; lint 0
errors; `next build` green.


## `combo mix 48 pieces` got its own category (2026-09-29, owner request)

The owner asked, in writing, for one dish to sit alone in a new category:

- new category `Combo mix` / `كومبو ميكس`, slug `combo-mix`;
- `combo mix 48 pieces` (`83b33e26-b48a-48bb-91c1-795f4e3c9c0f`, EGP 1540)
  moved out of `COMBO RAW` and into it.

Applied live as `20260929215322_combo_mix_category.sql`. Additive and idempotent:
one category inserted (`where not exists` by slug), then the dish repointed
(`is distinct from`). Nothing was deleted and no price, name, description or
image was touched — this is the owner's menu, and this is the only change asked
for.

**Position: with the combos, not at the end.** A follow-up,
`20260929215655_combo_mix_category_order.sql`, moved the section into the combo
run and shifted its two successors down by one. The sushi tail now reads:

| sort | section |
|------|---------|
| 14 | COMBO FRIED |
| 15 | COMBO RAW |
| 16 | **Combo mix** |
| 17 | SALADS |
| 18 | Sauces |

The owner chose this placement explicitly. Note the earlier session note that
"`Combo mix` was created at 18" describes the intermediate state only; the live
value is 16.

**`COMBO RAW` survives and is still public** with its other four dishes
(8/16/24/32 pieces). Do not "clean up" the category now that mix 48 has left it,
and do not repoint anything else; the owner moved exactly one dish.

Verified live: `/menu` lists 19 categories and the section ids render in order
`combo-fried · combo-raw · combo-mix · salads · sauces`; `/menu/combo-mix` = 200
with the dish and its 1540 price; `/menu/combo-raw` = 200 with four combos and
**no** `combo mix 48`; the Arabic cookie renders `كومبو ميكس`. Counts before/after:
categories 18 -> 19, menu_items 84 -> 84 (0 archived), 1 item in the new section.

**Note for the next session: `name_ja` is still being written.** The live schema
still carries `categories.name_ja` / `menu_items.name_ja` (the column drop was
reverted once because the separately-deployed Pages bundle still selected it),
and the Japanese seed `20260927070000_japanese_sushi_menu.sql` still sets it. The
new category's `name_ja` is left null on purpose — dropping the column is still
"deploy the app first, then drop", never the reverse.

Deploy credentials are not in this environment (`CLOUDFLARE_API_TOKEN` absent), so
the DB change is live immediately while this repo note ships with the next push.

## The ops agent never called a single tool (2026-09-29)

The agent looked healthy — it answered in Arabic, with numbers — while it had
executed **zero** tools. The numbers were the model's own prose. Three
independent defects, all silent:

1. **`QuotaEnforcedProvider` did not declare `completeWithTools`.** The agent loop
   probes the *wrapper* for that method (`supportsTools`), and the wrapper only
   forwarded `complete`. So every provider in the chain reported "cannot call
   tools", `nextTurn` sent no `tools` field, and the loop degraded to prose on the
   first step. The wrapped `RemoteProvider` had the method the whole time. Fixed
   by forwarding it (and declaring `toolCapable` through the wrapper), with the
   quota floor answered as `{...floor, toolCalls: []}` so enforcement still holds.
   **This is the class of bug no static check catches** — the method was optional
   on the interface, so omitting it was valid TypeScript.

2. **Cloudflare's REST reply was not unwrapped.** The API nests the completion
   under `result`; handing the raw envelope to `parseToolTurnOpenAiLike` yields
   zero calls and empty text — indistinguishable from a model that declined a
   tool. Now unwrapped before parsing.

3. **Gemini could not call tools at all**, yet `agentic` routing puts
   `gemini-free` first. `completeWithTools` is declared on the shared remote class
   for every kind, so Gemini *looked* capable and then threw. Two fixes: a real
   `completeWithGeminiTools` (`functionDeclarations` in, `functionCall` parts
   out), and an explicit `toolCapable` flag so `selectToolProvider` can skip a
   provider that cannot do tools instead of discovering it one failed call at a
   time. Gemini is tool-capable now, so the routed primary is used as intended.

**`toolCapable` exists because probing the method is not enough.** The remote
class declares `completeWithTools` for every kind; only the wire shape decides
whether it works. Declare the capability, do not infer it.

### The loop now walks the chain on a provider error
A mid-loop provider failure used to `break` and discard the rest of the chain.
It now shifts to the next provider once, and **clears `providerError` on a
successful call** — otherwise a recovered answer rendered the "no model"
notice. The step-budget return reports `active`, not the routed primary.

### The agent's ops reads must not depend on a request
`listStockItems` / `listOffers` are staff-RLS tables. Reading them through
`createServerSupabase()` works on `/admin` only because the middleware sets
`x-pw-path` and that function elevates — so the **scheduled report throws
"`headers` was called outside a request scope"**, and the cron route (no
`x-pw-path`) silently reads zero rows. Both look like "there is no data". They
now go through `staffTableClient()` (service role, request client as fallback).
Same reasoning as the deliverables note: a background agent has no request.

### Verification
`tests/agent-tool-calling.test.ts` (16, no network) pins the wrapper delegation,
the `toolCapable` contract, `selectToolProvider` ordering, both parsers and the
Cloudflare unwrap. `tests/agent-live.test.ts` (opt-in `AI_LIVE=1`) is the test
that would have caught this: it asserts `steps.length > 0`, because an answer
alone proves nothing — the model can write a confident sentence with no data.
Verified live: chain picks `gemini-free`, the loop runs `menu_summary` →
`orders_metrics` → `business_settings`, and the Arabic answer's figures are all
grounded. 282 tests pass, lint 0 errors, build green.

## Combo mix category (2026-09-29, owner request)

`combo mix 48 pieces` now sits alone in its own `Combo mix` / `كومبو ميكس`
category, ordered with the other combos. Applied live and committed as two
migrations, both **additive and idempotent**:

- `20260929215322_combo_mix_category.sql` — inserts the category if absent, then
  repoints the one dish. Nothing deleted; `COMBO RAW` keeps its other four dishes
  and both catalogues stay public.
- `20260929215655_combo_mix_category_order.sql` — reordering only: `Combo mix`
  moves to `sort_order` 16, after `COMBO RAW` (15), with `SALADS` (17) and
  `Sauces` (18) shifting down. No name, price, dish or flag touched.

Live result: 19 categories, 84 dishes, `combo-mix` at 16 holding exactly
`combo-mix-48-pieces` (EGP 1540, available). Per the standing rule this is the
owner's own instruction, so it was applied — the general prohibition on writing
menu rows still holds for anything not explicitly requested.


## Hard tasks: documents, charts and the reachability trap (2026-09-30)

The owner asked the agent to handle the hard things: reports, an inventory count,
CRM summaries, user reports, statistics, charts, boards, plans, docs and slide
decks. All of it now renders from live data — but the interesting part is that
**most of it was already written and invisible.**

### The reachability trap: tools.ts and registry.ts are two different lists
`callAgentTool()` in `tools.ts` had CRM, users, full-inventory and recent-orders
logic for a while. The model never called any of it, because the loop only sends
`specsForCapabilities()` — i.e. `AGENT_TOOLS`, built from `registry.ts` — and
`registry.ts` listed six tools. So the agent answered "I have no way to show you
order details" while `orders_recent` sat one file away, fully working.

`READ_TOOLS` is typed `Record<AgentToolName, AgentToolDef>`, so `tsc` **does**
catch an unregistered read tool — that is why adding the entries to `tools.ts`
alone failed to compile. But nothing catches the reverse, and nothing catches a
*write* tool. `tests/agent-reachability.test.ts` now asserts every tool the
prompt catalogue advertises is registered and reachable for the owner, and that
a kitchen role is never offered CRM/user tools.

**Rule: a tool is not shipped until it is in `registry.ts`.** Adding it to
`tools.ts` is half the work and produces a confident, wrong "I can't".

### The chat agent could not produce a document at all
Only the Deliverables panel and the scheduled agent could render a file. Asking
in chat for a slide deck returned the raw tool catalogue, because there was no
tool to call. `create_document` (registry, `ai.manage`) now renders any of the 13
kinds through the *same* `createDeliverable()` the panel uses, so a chart in chat
and a chart in the console are the same numbers. It is `mode: "read"` on purpose:
it writes a document, never business data, so it must not queue for approval.

The interactive SYSTEM_PROMPT also had to say so — it described reading and
writing but never mentioned documents, so the model talked *about* reports
instead of making one. The spec being present is not the same as the model
knowing to use it.

### Six new HTML kinds
`charts.ts` (inline SVG: bar, ranked bar, donut, gauge, empty state) and
`html.ts` (self-contained document shell: KPI grid, data table, note, section,
slide) feed `html-deliverables.ts`:

| kind | what it is |
|---|---|
| `sales_dashboard` | statistics page — revenue trend, status mix, category mix, top dishes, ratings, stock warnings |
| `crm_summary` | customer totals, every segment, newest signups, top customers by lifetime value |
| `users_report` | all users, staff by role, active/suspended |
| `inventory_report` | full stock count with values, thresholds and a reorder list |
| `slide_deck` | printable deck; one idea and at most one chart per slide |
| `strategy_brief` | written plan: findings, numbered actions, measures |

- **Self-contained by design.** Verified on the rendered files: 0 `<script>`,
  0 external URLs, every `<svg>` parses. They open offline and print to PDF.
  The user permitted JS/CDN; it was not needed, and no-CDN means a document
  never breaks because a host is down.
- **Charts cannot invent a figure.** A chart is a view of numbers the renderer
  already holds, and the raw figure sits beside every share ("680.00 EGP
  (45.2%)"), so a chart and its table cannot disagree.
- `agent_artifacts.kind` gained the six kinds (migration
  `20260929230000_agent_html_deliverables.sql`, applied live; constraint-only, no
  row touched). `format` already allowed `html` — `createDeliverable` had
  hardcoded `"md"`, so an HTML page would have been filed as markdown and
  rendered as source. It now takes the format from the renderer, and
  `deliverableContentType()` maps it to a real MIME type.

### Two data traps hit while writing the renderers
1. **`profiles` has no `lifetime_value`, `order_count` or `last_order_at`.** Those
   are computed by the `crm_customers` RPC. Selecting them off the table is a
   `tsc` error (good) and would be a silent empty result (bad). Use
   `listCrmCustomers()`.
2. **`InsightData` field names are not the obvious ones** — `pairs`, `itemTrend`,
   `weakItems`, `inactiveCustomers.count`, `inactiveCustomers.avgDaysSinceOrder`.
   Grep the interface before writing a renderer against it.

### Verified
13/13 deliverable kinds render against the live DB; 11/11 tools return real data
with no request scope. Agent answers, live: CRM -> `crm_summary` + `crm_customers`
(6 customers, top by order count); orders -> `orders_recent` (every order number,
status and total); stock -> `stock_inventory`; users -> `users_summary`
(6 users, 3 staff); stats -> `orders_metrics`; a deck request ->
`create_document:ok`. Zero ungrounded figures in any answer. 300 tests pass,
`tsc` clean, lint 0 errors (17 pre-existing `no-img-element` warnings),
`next build` green.

Note: one run returned an empty model turn ("no result written") — the model
emitted no tool call, not a wiring fault. The prompt fix above addresses the
cause; the loop's empty-turn fallback is unchanged.

## Vector memory, skill index and the team document library (2026-09-30)

The brief was "give the ops agent strong short- and long-term vector memory, and
let it do hard work — detailed reports and a deck". The agent could already do
the work; what was broken was the memory layer, and most of it was *silently*
broken in the same way as the earlier reachability and `security_invoker` bugs.

### Long-term memory was write-only, and 5 of its rows were unreadable
`agent_memory` (pgvector + HNSW) held rows, but the interactive chat never wrote
one — only `ops-agent.ts` did. Worse, **5 of the 6 live rows had `embedding is
null`**, so vector search could never return them. The chat *read* memory (3
recalled rows) and produced confident answers while learning nothing.

Three repairs, all live-verified:

1. **Embedding secret resolution.** `embeddings.ts` read the Cloudflare account
   id / token from a partial env view and found nothing, so every embed returned
   `null` and the write fell back to storing a row with no vector.
   `resolveSecretValue` / `resolveSecretValueWithEnv` are now exported from
   `src/lib/ai/provider.ts` and used here, so the CF REST call resolves the same
   way the provider chain does. Verified: CF REST embeddings HTTP 200, **dims
   1024**.
2. **Lexical fallback + dedupe + backfill.** When no embedding service is
   reachable, `recall` ranks by `lexicalSimilarity` (Arabic-diacritic-normalised)
   instead of returning nothing; `remember` suppresses an exact-normalised
   duplicate; `backfillMemoryEmbeddings()` repairs rows that predate a working
   embedder. Verified: backfill embedded **5** rows; a new `remember` stored
   `has_embedding = true`; `recall` returned it at **0.676**; a duplicate write
   returned `null` (suppressed).
3. **Auto-capture from chat.** `extractMemoryCandidates` only fires on an
   explicit instruction (`افتكر` / `remember` / `خد بالك` / …) and strips the
   instruction so the memory reads as the fact. A bare `"remember"` is now
   rejected (`MIN_FACT_CHARS`) — it used to store the word itself. Wired into the
   `agent-chat` action, so a chat turn can teach the agent, not just query it.

**Short-term memory:** long threads were truncated to the last 8 messages, so
anything older vanished. `agent_threads.summary` / `summary_upto` (migration
`20260930120000`) plus the rolling-summary compaction in
`src/lib/services/agent-chat.ts` keep a summary of the turns that fell out of the
verbatim window.

### The skill index was genuinely empty — and re-seeding it is the fix
`agent_skills` had **0 rows**, so `retrieveSkills` always returned nothing and
the agent answered from the prompt alone. The sources are generated
(`scripts/generate-repo-skills.mjs` → `repo-skills.generated.ts`) and synced by
`syncSkillSources`. Live result: **repo:AGENTS.md 231 chunks, repo:skills.md 10
chunks**, and a price-quoting query retrieved skills.md at 0.571 / 0.538 / 0.530.
Re-index from Admin → AI ops → Skills & memory ("Re-index repo skills"), or the
sync runs on every `prebuild`/`predev`.

### The team library: comments and reuse on deliverables
Owners/admins (`can_agent()`) could already see, export and download every
document. What was missing was the conversation *about* a document and a record
of reuse. Migration `20260930121000` adds `agent_artifact_comments` and
`agent_artifacts.reuse_count` / `last_reused_at`; `src/lib/agent/library.ts`
provides `listArtifactComments` / `addArtifactComment` / `markArtifactReused`
(the last through the atomic definer RPC `mark_artifact_reused`). Visibility is
unchanged — the library does not widen who can read a document, only lets the
people who can read one discuss it.

### The admin Skills & memory panel is now a real memory surface
It showed a count and nothing else. It now lists the remembered rows
(`listAgentMemory`) with their scope/kind, whether each is embedded, and a
Remove button, plus an "Embed pending" button for the backfill. Rendered and
checked live in **both locales** (`/admin/agent` 200 with a forged gate cookie):
EN "Remembered / Embed pending / Reuse / Comment / No comments yet", AR
"المستندات / تعليق / إعادة استخدام / لا توجد تعليقات / تنزيل" with `dir="rtl"`.

### Two traps hit again
1. **A `select` list is a contract.** `listDeliverables` did not select
   `reuse_count`, so the page's new `reuse_count` read failed `tsc` — the good
   direction. Add the column to the select, not a cast.
2. **`createServerSupabase()` is async**; three `logAudit(createServerSupabase(), …)`
   calls passed a Promise where a client was expected. The admin-only elevation
   only works on the resolved client.

`tests/agent-memory.test.ts` (9, no network) pins candidate extraction, the
lexical ranking and `renderMemoryContext`. Full suite **331 passed / 7 skipped**,
`tsc` clean, lint 0 errors (17 pre-existing `no-img-element` warnings),
`next build` green.

**Note:** the two new migration files are named `20260930120000_*` /
`20260930121000_*` locally but were applied remotely as
`agent_memory_readability` / `agent_document_library`. They are additive and
idempotent (`add column if not exists`, `create table if not exists`,
`create or replace function`), so re-applying is safe; the remote history was
left as-is rather than renumbered.
