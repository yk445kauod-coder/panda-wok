# Panda Wok

A mobile-first cloud-kitchen platform for Panda Wok — an Asian kitchen in Alexandria, Egypt.
Next.js App Router + Supabase (Postgres, Auth, Storage, Realtime), deployed on Cloudflare.

This is the operating system for the kitchen, not a landing page: customer ordering, kitchen
operations, CRM, loyalty, stock, feedback, messaging, analytics, and a provider-abstracted AI
layer all run on one schema with server-side validation and Row Level Security.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Language | TypeScript + Zod |
| UI | Tailwind CSS v4, Motion, lucide-react |
| Backend | Supabase — PostgreSQL, Auth, Storage, Realtime |
| Deploy | Cloudflare Workers via `@opennextjs/cloudflare` |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase + AI values
npm run dev
```

## Environment

All configuration is read from the environment — no business data is hard-coded in components.
See `.env.example` for the full list. `NEXT_PUBLIC_*` values are exposed to the browser by design;
everything else (service-role key, AI provider keys) stays server-side and is never shipped to the
client. The AI layer is provider-abstracted (OpenRouter / Cloudflare / Pollinations) and always
falls back to a deterministic, database-grounded answer when no provider is reachable.

## Database

Migrations live in `supabase/migrations/` and are the single source of truth. Apply them in order:

```bash
supabase db push          # or apply each file in the SQL editor
```

Key guarantees enforced in the database, not just the UI:

- prices, availability, stock and loyalty points are recomputed server-side on every order
- `orders` carries a unique `(user_id, idempotency_key)` so a double-tap cannot create two orders
- order status follows a state machine, and each transition is recorded in `order_status_history`
- cancelled/rejected/failed/refunded orders claw back redeemed loyalty points exactly once
- stock changes cascade to menu availability, but only for items in `auto` availability mode —
  admin-forced states (`forced_on` / `forced_off`) are never overridden by automation
- `profiles.email` is `citext` and phones are normalised to E.164, so duplicates cannot slip in
  through case or formatting differences

## SEO / AEO / GEO

Search and answer-engine visibility is treated as a product feature, generated from the live
database rather than hand-written per page:

| Surface | Where |
| --- | --- |
| `robots.txt` | `src/app/robots.ts` — blocks admin/transactional routes, explicitly allows AI crawlers |
| `sitemap.xml` | `src/app/sitemap.ts` — built from the live catalogue, so new dishes appear automatically |
| `llms.txt` | `src/app/llms-txt/route.ts`, rewritten to `/llms.txt` — the plain-text contract AI agents read |
| Structured data | `src/lib/seo/schema.ts` — Restaurant/LocalBusiness, Menu, MenuItem, Product, BreadcrumbList, WebSite, Organization, FAQPage |
| Metadata | `src/lib/seo/metadata.ts` — canonical, Open Graph, Twitter card, robots directives for every page |
| PWA | `public/manifest.webmanifest` + `src/app/icon.svg` |
| Headers / redirects | `public/_headers`, `public/_redirects` |

Structured data only emits facts the database actually holds — no invented address, hours, prices
or ratings. FAQ markup is only used where the page genuinely answers the question.

## Deploy to Cloudflare

Cloudflare's supported path for the App Router is the OpenNext adapter (the older `next-on-pages`
is Edge-only and breaks on Next 16). The adapter compiles the standalone Next build into a single
Worker on the `nodejs_compat` layer.

```bash
npm run preview   # build + run locally in workerd
npm run deploy    # build + deploy
```

Configuration: `wrangler.jsonc` (Worker entry, assets, compatibility flags) and `open-next.config.ts`.
`next.config.ts` must keep `output: "standalone"` — the adapter requires it.

Set the same environment variables in the Cloudflare dashboard (Workers → Settings → Variables) as
secrets. Never commit `.env.local`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production Next build |
| `npm run lint` | ESLint |
| `npm run preview` | OpenNext build + local workerd preview |
| `npm run deploy` | OpenNext build + deploy to Cloudflare |
| `npm run cf-typegen` | Generate Cloudflare binding types |
