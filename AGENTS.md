<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Ops memory (2026-09-23)
- Live prod: https://panda-wok.pages.dev (Pages project name: panda-wok; production_branch set to "production" via API; deploy command: `npx wrangler pages deploy /tmp/pw-pages --project-name panda-wok --branch production` where /tmp/pw-pages = .open-next full tree + _worker.js copy).
- Worker alias: https://panda-wok.yk445kauod.workers.dev (from `opennextjs-cloudflare deploy`).
- Remote Supabase project: xjbtsryidznsxqlynmfa; tenancy migration applied remotely as `011_tenancy_fk_hardening` (local file: supabase/migrations/20260922001000_tenancy_fk.sql — same body, different version name — avoid double-`db push` of the same body).
- Pages project git-build is misconfigured for this stack (build_command npx next build + out) — those deployed failed historically; prod rides direct-upload instead. Secrets: NEXT_PUBLIC_SUPABASE_URL/ANON, SUPABASE_URL, SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL set on the Pages project.

## Codebase map (2026-09-23)
- Customer app: src/app/(site)/* — home, menu, dish, cart, checkout, orders, tracking, account, loyalty, feedback, contact, about.
- Admin/CRM: src/app/admin/* — dashboard, orders, kitchen, users, CRM, segments, loyalty, feedback, broadcast, messages, AI centre, analytics, stock, upsell, menu CMS, settings, backups, exports. Guarded by src/middleware.ts (role-based), non-indexable.
- Auth: src/app/auth/* + supabase SSR session via src/lib/supabase/*
- Server actions = the API layer for mutations: src/lib/actions/* and src/lib/server-actions/*
- Services: src/lib/services/catalog.ts (restaurant singleton, menu, slugs, flags), orders/ (validation+idempotency), ai/ (assistant + provider chain + insights), crm/, loyalty/, stock/, messages/, broadcast/, feedback/, backup/, export/.
- Schema: supabase/migrations/* — single source of truth; RLS in 007_rls_and_storage; tenancy FK in 011 (remote) / 20260922001000 (local).
- SEO/AEO: src/lib/seo/, src/app/robots.ts, sitemap.ts, llms-txt/route.ts; schema.org from live DB only.
- Deploy: wrangler.jsonc (opennext worker + AI binding), open-next.config.ts; next.config.ts (standalone, unoptimized images, llms.txt rewrite).
