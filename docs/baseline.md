# Panda Wok — Baseline (Phase 0)

Snapshot of the project **as it exists today**, taken before any change in this
engagement. Everything below was verified against the code, the live Supabase
project (`xjbtsryidznsxqlynmfa`), and the live deployment
(`https://panda-wok.pages.dev`) — not copied from `README.md`, which is stale in
several places (see §6).

- Date: 2026-09-23
- Branch: `feature/panda-wok-platform` @ `c9914a9`
- Live site: `https://panda-wok.pages.dev` (Cloudflare Pages, OpenNext + `scripts/pages/_worker.js`)
- Supabase project: `xjbtsryidznsxqlynmfa`
- Cuisine (from the spec): **Asian** — wok, ramen, sushi, izakaya. Not
  exclusively Japanese or Chinese; the design must read "Asian kitchen", and the
  site already mixes a seigaiha motif (Japanese) with wok/ramen/sushi.

---

## 1. Systems in the spec (and whether the code has them)

| # | System | Present? | Primary route / action | Manual verification step |
| - | ------ | -------- | ---------------------- | ------------------------ |
| 1 | Menu browsing | ✅ | `src/app/(site)/menu/page.tsx`, `menu/[slug]` | Open `/menu`, confirm categories + dishes render from DB; open a dish slug |
| 2 | Dish detail | ✅ | `src/app/(site)/menu/page.tsx` (slug route) | Open `/menu/sushi`, confirm description / price / allergens |
| 3 | Cart | ✅ | `src/app/(site)/cart/page.tsx`, `cart-view.tsx` | Add a dish, open `/cart`, check line totals |
| 4 | Checkout + order placement | ✅ | `src/app/(site)/checkout`, `src/lib/actions/checkout.ts` (`placeOrderAction`), DB fn `place_order` | Fill checkout, place an order, confirm `orders` row + status history |
| 5 | Orders + tracking | ✅ | `src/app/(site)/orders`, `/orders/[id]` | Open an order, confirm the status timeline renders |
| 6 | Addresses | ✅ | `src/lib/actions/account.ts`, `address-book.tsx` | Add an address on `/account`, confirm it persists in `addresses` |
| 7 | Auth (phone-first) | ✅ | `src/lib/actions/auth.ts` (`signUpAction`/`signInAction`), `/auth/*` | Sign up with a fresh phone, confirm redirect to `/account` |
| 8 | Account | ✅ | `src/app/(site)/account/page.tsx` | Confirm profile, stats, loyalty, addresses |
| 9 | Loyalty | ✅ | `src/lib/services/loyalty.ts`, `/loyalty` | Open `/loyalty`, confirm tier ladder reads from `settings` |
| 10 | Feedback | ✅ | `src/app/(site)/feedback`, `feedback-form.tsx` | Submit a rating, confirm `feedback` row |
| 11 | Admin dashboard | ✅ | `src/app/admin/page.tsx` (+ 20 sub-pages) | Sign in as staff, open `/admin` |
| 12 | Kitchen screen | ✅ | `src/app/admin/kitchen/page.tsx` | Confirm live order queue |
| 13 | CRM / segments / insights | ✅ | `src/app/admin/crm/*`, `src/lib/crm/` | Open `/admin/crm`, confirm customer list + stats |
| 14 | Messaging / chat | ✅ | `src/app/admin/{chat,messages}`, `src/lib/services/messaging.ts` | Open `/chat` as a customer, reply as staff |
| 15 | Broadcast | ✅ | `src/app/admin/broadcast`, `broadcast-composer.tsx` | Compose + review a broadcast (do not send) |
| 16 | Stock | ✅ | `src/app/admin/stock`, `stock-forms.tsx` | Adjust a stock item, confirm `stock_movements` |
| 17 | Upsell | ✅ | `src/app/admin/upsell`, `upsell-form.tsx` | Confirm rules list |
| 18 | Menu CMS | ✅ | `src/app/admin/menu`, `menu-item-form.tsx` | Add/edit a dish, confirm it appears on `/menu` |
| 19 | Categories CMS | ✅ | `src/app/admin/categories`, `category-form.tsx` | Add/edit a category |
| 20 | Settings + feature flags | ✅ | `src/app/admin/settings`, `settings-forms.tsx` | Edit a business rule, confirm the public page changes without a deploy |
| 21 | Analytics | ✅ | `src/app/admin/analytics`, `src/app/api/analytics/route.ts` | Confirm events land in `analytics_events` |
| 22 | Exports / backups | ✅ (partially) | `src/app/admin/{exports,backups}` | See §4 — RPCs exist live; confirm a job runs |
| 23 | AI assistant | ✅ | `src/components/panda/assistant.tsx`, `src/lib/ai/` | Open the panda, ask a menu question |
| 24 | AI admin | ✅ | `src/app/admin/ai`, `ai-provider-form.tsx` | Confirm provider rows + usage ledger |
| 25 | i18n AR/EN + RTL | ✅ | `src/lib/i18n/`, `language-switcher.tsx` | Flip the language, confirm `<html lang dir>` and Arabic copy |
| 26 | SEO / AEO | ✅ | `src/lib/seo/`, `robots.ts`, `sitemap.ts`, `llms-txt/route.ts` | Fetch `/robots.txt`, `/sitemap.xml`, `/llms.txt` |
| 27 | **Page mascot** | ✅ | `src/components/layout/floating-panda.tsx` | See §5 — there are **two** mascots in the tree today |
| 28 | Payments (online) | ❌ | — | Not in the spec; no payment provider is integrated (cash/COD only) |
| 29 | Reservations | ⛔ flag off | feature flag `reservations = false` | Intentionally disabled |

`README.md` claims module directories (`src/lib/orders/`, `src/lib/backup/`,
`src/lib/export/`, `src/lib/feedback/`, `src/lib/messages/`, `src/lib/broadcast/`,
`src/lib/stock/`, `src/lib/loyalty/`) that **do not exist**. The real layout is
`src/lib/services/`, `src/lib/crm/`, `src/lib/ai/`, `src/lib/auth/`,
`src/lib/actions/`, plus the dirs listed above. Treat the filesystem as truth.

---

## 2. Baseline verification results (before changes)

| Check | Command | Result |
| ----- | ------- | ------ |
| Unit tests | `npm test` | ✅ 38 passed / 4 files (`errors`, `phone`, `validation`, `modifier-selection`) |
| Typecheck | `npm run typecheck` | ✅ 0 errors |
| Lint (src only) | `npx eslint src` | ✅ 0 errors, 3 warnings (2× `no-img-element` in `brand-logo.tsx`, 1× `exhaustive-deps` in `assistant.tsx`) |
| Lint (as configured) | `npm run lint` | ❌ **1186 errors / 22045 warnings** — `eslint.config.mjs` ignores `.next/.open-next/.wrangler` but **not `.pages/`**, so it lints the uploaded build output. Fix in Phase 2. |
| Build | `npm run pages:build` | ✅ succeeds (verified in the prior session) |
| Live routes | `curl -sIL` | ✅ all 200, no redirects: `/`, `/menu`, `/menu/sushi`, `/about`, `/contact`, `/cart`, `/loyalty`, `/feedback`, `/checkout`, `/account`, `/admin` |

### Live data actually in the database

| Table | Rows | Note |
| ----- | ---- | ---- |
| `restaurants` | 1 | singleton `panda-wok` |
| `categories` | 5 | real |
| `menu_items` | 12 | real names/descriptions/prices (EGP 45–215); bilingual `name_ar` populated |
| `menu_images` | **0** | **no dish photography yet** — cards fall back to the seigaiha empty state |
| `orders` | 0 | none yet |
| `profiles` | 2 | owner + one |
| `addresses` | **0** | — |
| `feedback` | 0 | — |
| `loyalty_rewards` | 3 | — |
| `stock_items` | 15 | — |
| `upsell_rules` | 2 | — |

Settings (see §4) are seeded with real values except the support block, which is
**intentionally empty**: `support.phone`, `support.whatsapp`, `support.email` are
`null`, `support.social` = `{}`, `support.opening_hours` = `{}`. The contact page
renders a designed empty state in that case, and structured data omits missing
fields — matching the "no invented facts" rule.

---

## 3. Mock / hardcoded / AI-slop audit (files + lines)

**No fabricated content was found.** Specifically checked and clean:

| Risk | Finding |
| ---- | ------- |
| Hardcoded contacts | ✅ none — no `01095052232` / `01500988196` / social URLs in `src/**`; all contact data is read from `settings` |
| Fake testimonials / reviews / aggregate ratings | ✅ none. `rating` matches are the *feedback form input* and an admin display, not invented social proof |
| Invented stats / "X happy customers" / counters | ✅ none. `account/page.tsx` "stats" are the signed-in user's own real DB numbers |
| Stock photos / placeholder image services | ✅ none. No `unsplash`/`pexels`/`picsum`/`placehold`. Dish images come from Supabase Storage; missing → designed empty state |
| `lorem ipsum` | ✅ none |
| Emoji as decoration | ✅ none in `src/**` except `★` in `admin/page.tsx:220` (a real feedback-rating glyph, not decoration) |
| Fabricated reviews schema | ✅ `schema.ts` does not emit `AggregateRating`/`Review` |

**Hardcoded copy that should become admin-editable** (Phase 3/4 — violates
"admin controls all content"):

| # | Location | Content | Should move to |
| - | -------- | ------- | -------------- |
| C1 | `src/app/(site)/about/page.tsx:84–110` | "A cloud kitchen, not a dining room", "How we cook", "Allergens and honest labelling" + 3 body paragraphs | a `pages.about.*` content source editable in admin |
| C2 | `src/app/(site)/about/page.tsx:130,136` | CTA labels "See the menu", "Contact us" | (UI text — acceptable to keep in i18n) |
| C3 | `src/app/(site)/contact/page.tsx:18–20` | metadata `title`/`description` templates | brand/page SEO source (admin) |
| C4 | `src/app/(site)/page.tsx:40–47,83` | home page SEO `keywords` and menu schema description (built from a hardcoded English sentence) | page SEO source (admin) |
| C5 | `src/app/(site)/menu/page.tsx:28` | Arabic keyword list `["قائمة باندا ووك", …]` | page SEO source (admin) |
| C6 | `src/lib/i18n/dictionaries/{en,ar}.ts` | marketing-ish strings (`home.featuredSubheading`, `about.*` headings, etc.) | long-form marketing copy → admin; fixed UI labels stay |
| C7 | `src/app/(site)/about/page.tsx:33` | fallback description when `restaurant.description_en` is null (a real sentence, but code-owned) | admin |

Nothing here is *false* content; the issue is ownership — the spec requires the
admin to change it without a deploy.

---

## 4. Admin-controls-everything audit

"Can the admin change this today from `/admin/*` without a deploy?"

| Content shown to visitors | Admin-editable today? | Where |
| ------------------------- | --------------------- | ----- |
| Menu items (name/desc/price/allergens/flags) | ✅ | `/admin/menu` (`menu-item-form.tsx`) |
| Categories | ✅ | `/admin/categories` |
| Dish images | ✅ (upload) | `/admin/menu` (Supabase Storage) — **no images uploaded yet** |
| Business rules (delivery fee, min order, ETA, tax, loyalty tiers, max qty) | ✅ | `/admin/settings` (`SettingsForm`) |
| Brand name / tagline / city / country / cuisine | ✅ | `/admin/settings` (`brand.*`) |
| Contact phone / WhatsApp / email | ✅ | `/admin/settings` (`support.*`) — **currently null** |
| Social links | ✅ | `/admin/settings` (`support.social`) — **currently `{}`** |
| Opening hours | ✅ | `/admin/settings` (`support.opening_hours`) — **currently `{}`** |
| Feature flags (show/hide modules) | ✅ | `/admin/settings` |
| Upsell rules | ✅ | `/admin/upsell` |
| Loyalty rewards | ✅ | `/admin/loyalty` |
| FAQ / long-form page copy (about, home marketing) | ❌ | **code only** (see C1/C6) |
| Per-page SEO title / description / share image | ❌ | **code only** (`buildMetadata` calls; see C3/C4/C5) |
| Delivery **zones** (area → fee) | ❌ | only global `delivery.fee`/`free_over`; no zone model |
| Landing banners / promos | ❌ | no model (featured dishes are flag-driven, not a promo banner) |
| Mascot sprite / frame count / speed | ❌ | code constants (fine per spec if documented) |
| Restaurant address / geo (lat, lng, area) | ✅ (DB row) | not surfaced in a dedicated admin form |

---

## 5. Mascot audit

There are **two** panda implementations in the tree. This matters for the spec,
which says "keep the mascot as-is" and "delete any code-drawn SVG mascot".

| # | Item | Location | Type | Where it appears |
| - | ---- | -------- | ---- | ---------------- |
| M1 | `Mascot` from the `page-mascot` npm package (v0.1.0), built from **WebP sprite sheets** | `src/components/layout/floating-panda.tsx:4,92` | ✅ the real sprite mascot | Floating companion on every customer page (`(site)/layout.tsx:106`) |
| M2 | `PandaMascot` — **hand-drawn inline SVG** with 12 expressions | `src/components/panda/mascot.tsx` | ⚠️ code-drawn SVG | The AI assistant header/avatar (`assistant.tsx:149,169`) |

Sprite assets present in the repo:

- `public/mascots/panda-directions.webp` (100,590 B) — fed as `directions`
- `public/mascots/panda-reactions.webp` (111,338 B) — fed as `reactions`

M1 behaviour today: follows the pointer (rAF-throttled rotation + translate,
lerp 0.08), pure CSS transitions, tap/Enter opens the AI assistant, sits
`bottom-24 right-3` on mobile / `bottom-6 right-6` on desktop. It respects
`prefers-reduced-motion` (skips the rAF loop, applies a static face).

Gaps vs. the spec's mascot section:

- M2 is a code-drawn SVG mascot → the spec says to remove code-drawn SVG mascots
  and use the **original sprite sheets**, keeping shape/placement/behaviour
  unchanged. The original sheets here are the two WebP files above; the assistant
  avatar is a *different* character style (not from the sheets).
- No single config file declares frame width / frame count / fps for the sheets —
  that lives inside the `page-mascot` package.
- `IntersectionObserver` pause-when-offscreen and lazy loading are **not**
  implemented by the wrapper (the package may handle some of this; needs
  verification).

**Decision needed from you (blocking, Phase 4):** the assistant (M2) currently
uses a hand-drawn SVG panda. To comply with "no code-drawn mascot SVG," I need to
either (a) replace it with the `page-mascot` sprite (same character as the
floating one), or (b) keep it if you consider the assistant a separate
non-mascot illustration. I will not invent a new character. **Please confirm
which.**

---

## 6. Spec vs. reality discrepancies worth flagging

1. `README.md` module map is fictional (see §1 note).
2. `README.md` deploy section still describes the old "redirector" Pages setup;
   reality is OpenNext `.pages` output deployed directly.
3. The design tokens already exist in `src/app/globals.css` (`@theme`) and partly
   match the requested palette, but use different names/values than the spec's
   `--ink/--vermilion/--gold/--rice/--surface/--muted/--border`. Reconciliation
   is a Phase 4 task.
4. Fonts today: `Inter` (body/Latin) + `Fraunces` (display) + `IBM_Plex_Sans_Arabic`
   (Arabic). The spec asks for a heavier Arabic pairing (IBM Plex Sans Arabic +
   Noto Kufi Arabic) and a decorative Asian serif. Phase 4 will align.
5. `support.*` settings are empty live, so the footer/contact currently show
   empty states. Phase 4 must seed the real numbers you supplied **into the DB**
   (not into code).

---

## 7. Known non-mascot gaps carried into later phases

- No dish images (Storage empty) → menu reads as text-only today.
- No delivery zones, no promo/banner model, no FAQ model, no per-page SEO fields
  in the DB.
- `npm run lint` is broken by `.pages/` (Phase 2).
- `CLOUDFLARE_API_TOKEN` repo secret is still missing, so the GitHub Actions
  deploy step fails; deploys are done via `npm run pages:deploy`.

---

## 8. Live redirect matrix (baseline, measured 2026-09-23)

`curl -sI` without following redirects:

| Route | Status | Redirects | Note |
| ----- | ------ | --------- | ---- |
| `/` | 200 | 0 | public |
| `/menu` | 200 | 0 | public |
| `/menu/sushi` | 200 | 0 | public |
| `/about` | 200 | 0 | public |
| `/contact` | 200 | 0 | public |
| `/cart` | 200 | 0 | public |
| `/feedback` | 200 | 0 | public |
| `/loyalty` | 307 | 1 | **auth-gated** (`middleware.ts` `PROTECTED_PREFIXES`) |
| `/checkout` | 307 | 1 | auth-gated |
| `/account` | 307 | 1 | auth-gated (allowed exception) |
| `/admin` | 307 | 1 | auth-gated (allowed exception) |

Public pages already return 200 with **zero** redirects. `/loyalty` is gated
today; the spec's Phase 5 list does not require it to be public, but it *is* in
the header nav, so an anonymous visitor tapping "Loyalty" is bounced to sign-in.
Flagged for a decision in Phase 5.

## 9. Defects found during baseline (to fix in later phases)

| # | Defect | Evidence | Phase |
| - | ------ | -------- | ----- |
| D1 | **Two floating panda buttons render at once** | `(site)/layout.tsx:105` renders `<PandaAssistant>` (own floating trigger at `assistant.tsx:140`, `fixed bottom-20 right-4 … md:bottom-6 md:size-16`) **and** `<FloatingPanda>` (`fixed bottom-24 right-3 … md:bottom-6 md:right-6`). Both are visible on every customer page and overlap on mobile and desktop. | 4 |
| D2 | `npm run lint` fails with 1186 phantom errors | `eslint.config.mjs` ignores `.next/.open-next/.wrangler` but not `.pages/` | 2 |
| D3 | Two mascot implementations coexist (sprite + code-drawn SVG) | §5 M1/M2 | 4 (needs your decision) |
| D4 | Page copy + per-page SEO are code-only (7 items) | §3 C1–C7 | 3/4 |
| D5 | `support.*` settings empty → contact/footer show empty states | live `settings` query | 4 |

## 10. Baseline status line

> Functions in the spec: 29 listed, 27 present, 1 intentionally off
> (reservations), 1 absent by design (online payments). Mock/fabricated content:
> **0 found**. Admin-editable today: menu, categories, images, business rules,
> brand, contact, social, hours, flags, upsell, loyalty. Not yet editable: page
> copy and per-page SEO (7 items, C1–C7). Mascot: sprite mascot implemented
> (M1); one code-drawn SVG mascot remains (M2) pending your decision. Baseline
> tests: 38 pass, typecheck clean, 3 lint warnings, live routes all 200/no
> redirects.
