# Project memory — azura-anime (LAVA)

## i18n / AR-EN separation (hard-won)
- **Every UI string goes through `t()` and must exist in `web/src/lib/i18n/dict.ts`** (the AR dict). Audit pattern:
  `re.findall(r'\bt\(\s*"([^"]+)"\s*\)', src)` per file vs dict keys — an empty diff means clean.
  Also check variable-arg `t(CONST)` (HEADLINE, LEAD, p.b, etc.) — those aren't caught by the regex.
- **Dynamic backend strings** (DB titles, metrics, insight bodies, rank hits) are translated client-side via
  `useTranslated()` (`lib/i18n/data.ts`) → POST `/api/translate` (worker `routes/misc.ts`), cached in
  `localStorage["lava.i18n.<lang>"]`. English is a no-op. Don't render dynamic fields raw — wire `useTranslated`.
- `/insights` returns EN DB rows; the Insights page translates title/body/category via `useTranslated`. The agent
  itself answers in the active language (translate stage).
- RTL: `document.documentElement.dir` set by provider. app.css has an `[dir=rtl]` section; new `margin-left:auto`
  rules should also set `margin-inline-start:auto` (see `.mission/.ts/.bar-val/.lv-key b`).
- Pages using raw English to check when editing: any page importing `useI18n` but rendering untranslated
  constants. Landing `LEAD` was a real gap (headline was in dict, lead wasn't).

## Council page — deleted (2026-11-13)
- Fully removed: page dir, nav entry, lazy route, 5 dict keys + all locales, stale `/council.html` redirect.
  Backend `/api/council` + `workers/lava-agent/src/council.ts` left intact (harmless, no UI refs).

## Deploy (web-only changes)
- Local wrangler binary: `workers/lava-agent/node_modules/.bin/wrangler` (avoids npx prompt hang).
  `set -a && . ../.env && set +a` to load `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`.
  `wrangler pages deploy dist --project-name=lava-project --branch=main --commit-dirty=true` from `web/`.
- `public/_headers` ships `max-age=0, must-revalidate` for HTML — without it canonical keeps the old bundle ~1 week.
- Worker unchanged in this session; only Pages redeployed.

## Verified live (2026-11-12 late)
- Commit `84d3e32` pushed; worker `952dfb47-…`, Pages `4d95aed7` (assets `index-OLh2xAQc.js`).
- Live: 1106-char AR insight body translates; source pills show real NTRS titles; live CSS = IBM Plex Sans Arabic + Orbitron, no Noto.
- Build: `tsc -b` + 26 vitest pass.
- File formats: locale `.ts` are GENERATED+SORTED (`build_locales.py` from `i18n_locales.json`), Arabic `dict.ts` is hand-written+unsorted. `web/dist` chunks reproduce source dicts exactly (recovery source). `git fetch` before pushing a long-lived local branch — histories diverged here.
## i18n gotchas (LAVA web, verified 2026-11-12)

- `dict.ts` holds hand-written Arabic only (unsorted). `locales/*.ts` and
  `scripts/i18n_locales.json` are GENERATED + sorted via `scripts/build_locales.py`.
  A key exists in all three or none — removing it from `dict.ts` alone leaves it
  in the generated locales. Patch all three together.
- `provider.tsx` `t()` = bundled dict → runtime `/api/translate` cache → English
  source. Strings passed as `t(variable)` (Chat.tsx `PROMPTS`, `PROMPT_CARDS`,
  `MODELS` labels/groups) are invisible to a static `t("…")` scan and flash
  English until the API fills them. Add hand-written AR for these.
- The dict VALUE for `"Live research backend"` was `"خادم بحثي مباشر"`; that
  topbar caption was removed in 84d3e32, so the key was orphaned. Purged along
  with `live backend` (Dashboard pill) + "Live telemetry…" subtitle + the
  "Research workspace" caption. Commits f25d5e0, ccf6d8d pushed to main.
- PSI reaches RAG: `mergePsi()` + `psiSearch()` in `retrieval.ts` run in BOTH
  `retrieve` and `retrieveGraded`. But **retrieval alone is not enough** — the
  row renderer (`renderPsiRow`, now `src/psiRow.ts`) must read the column names
  out of the stored `[{name,type}]` list or every row collapses to `(no values)`
  and answers deny the numbers exist. Fixed + tested 2026-11-12 (6 tests).
  Live `/psi` = 24 investigations / 22 tables / 2009 rows.

# Project memory — panda-wok (Next + OpenNext on CF Pages + Supabase)

## Perf / Free-plan caps (fixed 2026-11-13, commit e842dda, deployed 58daf36a)
Symptom: admin console heavy; >1 admin tab exceeded CF Free Worker request cap + 10ms CPU
cap (Error 1102). Root causes & fixes (all in place):
- **Sidebar prefetch storm**: ~27 `/admin/*` routes are `force-dynamic`; `<Link>` prefetch
  fires a real Worker invocation per route on every console load. Fixed with `prefetch={false}`
  in `src/components/admin/admin-shell.tsx`.
- **Polling**: `src/lib/live/visibility.ts` `startVisiblePoll(cb, ms)` pauses on hidden tab.
  Used by order-alert-watcher, kitchen-board, live-refresh. Order-alert poll is adaptive:
  8s without realtime, 60s once socket SUBSCRIBED.
- **CPU per view**: `getDashboardMetrics` folds up to 2k orders + 5k items in JS every render.
  New `src/lib/cache/admin-aggregate.ts` `cachedAdminAggregate(fn, keyParts, {revalidate})`
  wraps `unstable_cache` for admin aggregates (5s TTL; args are part of the key). Public data
  stays on `cachedPublic` (10min). KV namespaces NEXT_INC_CACHE_KV / NEXT_TAG_CACHE_KV ARE
  bound in prod Pages (`wrangler.toml`) and the Worker (`wrangler.jsonc`) — caching is live.
- **Auth cost per poll**: order-alert poll now uses new `assertGateCapability` (reads gate
  cookie only) instead of `assertCapability` (full `getAdminSession`: auth.getUser + profile +
  staff + owner lookups).

## Deploy (Pages, prod branch feature/panda-wok-platform)
- Build: `npm run pages:build` → `.pages/`. Local wrangler: `node_modules/.bin/wrangler`.
- Deploy: `CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node_modules/.bin/wrangler pages
  deploy .pages --project-name=panda-wok --branch=feature/panda-wok-platform --commit-dirty=true`
- Prod branch is `feature/panda-wok-platform`; canonical `panda-wok.pages.dev` serves prod,
  HTML is `no-store` so no cache purge needed. Secrets redacted from `next-env.mjs` by build.

## Data reality (live counts 2026-11-13)
Used/unused signals: offers 1, feedback 1, ai_requests 65, ops_agent_runs 48 / actions 169,
agent_threads 3, agent_artifacts 77, mcp_servers 1, exports 10, backup_records 1.
**Zero**: loyalty_accounts, upsell_rules, broadcasts, stock_items, agent_automations.
=> loyalty, upsell, broadcast, stock UIs are effectively unused features (trim candidates).

# Project memory — panda-wok (Next.js + OpenNext on Cloudflare Workers/Pages + Supabase)

## Deploy
- Repo `yk445kauod-coder/panda-wok`, branch `feature/panda-wok-platform`. Pages `panda-wok.pages.dev`,
  Worker `panda-wok.yk445kauod.workers.dev` (Pages advanced mode → `_worker.js` wrapper).
- Deploy from repo root: `export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... && npm run pages:deploy`.
  That script builds `.open-next` if needed, assembles `.pages`, uploads assets + worker, and warms
  en/ar public routes. Worker config lives in `wrangler.jsonc`.
- `scripts/pages/_worker.js` is the Pages entrypoint: serves static assets from the `ASSETS` binding first,
  then an edge cache for anonymous public pages, then the OpenNext handler. `SERVER_ONLY_PREFIXES`
  (`/cloudflare/`, `/server-functions/`, ...) must never be reachable or the service-role key leaks.

## Cloudflare Free plan CPU (Error 1102) — root cause + fix (2026-11-13)
- Symptom: admin console 503 `error code: 1102` as soon as ~2-3 admins polled concurrently.
- **Root cause: per-call `Intl` construction.** The Workers runtime caps *CPU* at 10 ms/request on Free.
  `src/lib/utils/format.ts` built a `new Intl.NumberFormat`/`DateTimeFormat` on every call, and the admin
  dashboard + every public render call `formatPrice/formatNumber/formatDate/formatDateTime/formatTime`
  dozens of times. `src/lib/services/store-hours.ts` `localMinutes()` did the same per render. That churn
  alone exceeded 10 ms. Fixed by memoizing each formatter (module-level `Map`, keyed by locale+variant).
- `src/app/admin/page.tsx` header also built a `new Intl.DateTimeFormat` inline → moved to `formatLongDate()`.
- Verification of a fix: burst `for i in seq 1 60; curl .../admin &; done` — before: 1102 by ~10 concurrent;
  after: 60/60 = 200. Also burst every `/admin/*` page (39/39 = 200). Cloudflare GraphQL
  `workersInvocationsAdaptive` cpuTimeUs is unreliable for this script (Pages invocations barely show).
- Prior cut (`e842dda`) already trimmed the admin prefetch storm + visibility-aware polling.
- Heavy deps still in package.json but NOT in the server bundle: chart.js/react-chartjs-2 (client-only,
  `_next/server/chunks` has no chart.js), leaflet (client-only), sharp (scripts only). `date-fns` appears
  in the handler.

## Removed features (2026-11-13, commit a48fd26)
- Deleted unused admin consoles: agent/*, ai/*, loyalty, stock, broadcast, upsell (~16.7k lines). Routes
  now 404. Retained `src/lib/agent/{arabic,memory,ooxml,skills,xlsx}.ts` (used by backup/export render).
- Tests 354 passed / 31 skipped; lint 0 errors; tsc clean; OpenNext build OK.
