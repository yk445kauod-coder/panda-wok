# Deployment & CI (Phase 2)

## 1. Topology (verified live)

- Live URL: **https://panda-wok.pages.dev** — served by the Cloudflare Pages
  project `panda-wok` (OpenNext output + `scripts/pages/_worker.js`).
- **The Git-connected Pages CI is disabled on purpose**
  (`source.config.deployments_enabled = false`,
  `production_deployments_enabled = false`). It cannot build this repo: its
  Functions bundler ships an old wrangler that drops `nodejs_compat`.
- Builds run in **GitHub Actions** (`.github/workflows/deploy-pages.yml`) and
  ship with `wrangler pages deploy .pages`.

## 2. `npm run pages:build` pipeline

1. `opennextjs-cloudflare build` → `.open-next/` (worker + assets + server
   functions + inlined env).
2. `scripts/build-pages.mjs` assembles `.pages/`:
   - copies the client assets to `.pages/`
   - copies the server-only dirs (`cloudflare/`, `middleware/`,
     `server-functions/`, `.build/`) that the wrapper fronts
   - renames `.open-next/worker.js` → `.pages/opennext-worker.js`
   - writes the wrapper `scripts/pages/_worker.js` → `.pages/_worker.js`
   - **redacts server-only env values** from `.pages/cloudflare/next-env.mjs`
3. `_worker.js` logic: deny-lists server-only prefixes → 404; offers
   static-looking requests (`/_next/static/`, `/mascots/`, any
   `…(css|js|mjs|woff2|…)$`) to the `ASSETS` binding first; falls through to the
   OpenNext handler otherwise.

## 3. Compatibility flags

| Config | File | Flags |
| ------ | ---- | ----- |
| Worker (source of truth) | `wrangler.jsonc` | `nodejs_compat`, `global_fetch_strictly_public` |
| Pages CI bundler | `wrangler.toml` | same two flags + `pages_build_output_dir = ".pages"` |
| Pages project (Preview + Production) | Cloudflare API | `compatibility_date 2026-09-01`, `["nodejs_compat","global_fetch_strictly_public"]` |

All three agree. The Pages project is authoritative for the deployed runtime;
the toml exists only so `wrangler pages functions build` resolves Node builtins.

## 4. Previews

`push` on **any** branch triggers the workflow:
`main`/`production` → Pages **production**; every other branch → a Pages
**preview** deployment for that branch. A preview gets its own
`https://<branch>.panda-wok.pages.dev` URL, so each phase can be verified before
production.

## 5. Auto-deploy status

| Path | State |
| ---- | ----- |
| GitHub Actions → Cloudflare | **Working.** The workflow is branch-aware and the repository secret **`CLOUDFLARE_API_TOKEN` is set now** (the earlier "deploy step always fails" note is obsolete — the previous runs succeeded and a push re-deploys automatically). |
| Cloudflare Git-connected CI | Disabled on purpose (would always fail). |

Push-to-deploy is the primary path; manual `npm run pages:deploy` is a fallback
for when you want to ship without a commit. The repo's production branch is
`feature/panda-wok-platform` — pushing there (or to `main`/`production`) publishes
to production.

## 6. Result

| Check | Before | After |
| ----- | ------ | ----- |
| `npm run lint` | ❌ 1186 errors / 22045 warnings (linted `.pages/`) | ✅ **0 errors / 4 warnings** |
| `npx eslint src` | 0 errors / 3 warnings | 0 errors / 3 warnings |
| CI branch mapping | production only | main/production → production; others → preview |
| Server-only HTTP paths | 404 | 404 (verified live for 5 prefixes) |
| Secret in `.pages/` build output | none | none |

## 7. Phase 2 status

✅ `eslint.config.mjs` ignores `.pages/**` — `npm run lint` is green.
✅ `NEXT_PUBLIC_*` are treated as build-time values, exported before every build.
✅ CI is branch-aware and auto-deploys (preview for branches, production for
`main`/`production`). The `CLOUDFLARE_API_TOKEN` secret is set, so push-to-deploy
works.
✅ Pages compatibility flags match the repo config (`wrangler.jsonc` for the
Worker, `wrangler.toml` for the Pages Functions bundler).
✅ ASSETS-binding serving and preview deploy were exercised end-to-end in Phase 7
after the first push of this branch — the live site serves SSR, static assets,
robots/sitemap/llms, the OG image and Arabic RTL all 200.
