# Panda Wok — Architecture Plan (Phase 3)

> **STATUS: awaiting your approval.** No code changes were made for this phase.
> Read §8 (Decisions) first — three choices need a yes/no before I start Phase 4.

This document plans the work in the Arabic brief: a complete, admin-editable
content layer, on-brand design, motion, and a "control everything from `/admin`"
model — without breaking the live site. It is grounded in the Phase 0 baseline
(`docs/baseline.md`) and the Phase 1/2 env & deploy docs.

---

## 1. Guiding constraints (non-negotiable from the brief)

1. **No invented content.** Every visitor-facing string is real business data or
   clearly-labelled placeholder that the admin can edit. (Baseline: already true —
   0 fabricated items.)
2. **Nothing breaks.** Live routes keep returning 200 with no new redirects.
3. **Admin controls everything** that a visitor reads, without a redeploy.
4. **Don't hardcode** business data, phones, socials, colours, or copy in
   components.
5. **DOM/JSON-LD/nav/sitemap/robots** must reflect what is actually on the page.
6. **Bilingual (en/ar) + RTL** for all new content.
7. **Original panda mascot** — no code-drawn SVG character; original sprite sheet
   only.

---

## 2. Content model — what's missing

Baseline §4 lists what is already admin-editable (menu, categories, images,
business rules, brand, contact, social, hours, flags, upsell, loyalty). These are
**not** yet editable and are the work of Phase 3/4:

| # | Content | Today | Needed |
| - | ------- | ----- | ------ |
| C1 | About-page long-form copy (3 sections + intro) | hardcoded in `about/page.tsx` | DB-editable, bilingual |
| C2 | Home-page marketing copy (featured heading/subheading, hero tagline) | i18n dictionary | DB-editable long-form |
| C3 | FAQ | does not exist | DB-editable, bilingual, with JSON-LD |
| C4 | Delivery zones (area → fee / free-over / ETA) | single global rule | DB table + admin editor |
| C5 | Promo banners / announcements | does not exist | DB table + admin editor |
| C6 | Per-page SEO (title, description, OG image, canonical flags) | code `buildMetadata` calls | DB table + admin editor |
| C7 | Contact page copy | partly settings | merge into C1 model |
| C8 | Mascot config (sheet, size, speed, enabled) | code constants | settings doc (optional) |

### 2.1 Chosen approach: a small number of purpose-built tables, not one big blob

Reusing the generic `settings` key/value table for long-form bilingual copy is
possible but a poor fit: it has no locale, no ordering, no publish state, and the
generic editor would show JSON blobs to staff. I propose three new tables plus
two extracted namespaces, each with typed columns, RLS, and a dedicated editor:

```
page_content        -- long-form, per page and per locale
  id              uuid pk
  restaurant_id   uuid not null default current_restaurant_id()
  page_key        text not null          -- 'home' | 'about' | 'contact'
  section_key     text not null          -- 'intro' | 'story' | 'how_we_cook' | ...
  locale          text not null check (locale in ('en','ar'))
  heading         text
  body            text                   -- markdown-lite (paragraphs + emphasis)
  sort_order      int not null default 0
  is_published    boolean not null default true
  updated_at      timestamptz
  unique (restaurant_id, page_key, section_key, locale)

faqs                -- also drives FAQPage JSON-LD
  id, restaurant_id, locale, question, answer, sort_order, is_published

delivery_zones      -- replaces the single global fee when populated
  id, restaurant_id, name_en, name_ar, areas text[], fee numeric,
  free_over numeric, eta_minutes int, is_active

announcements       -- promo bar / banner
  id, restaurant_id, locale, message, href, tone, starts_at, ends_at,
  is_active, sort_order

page_seo            -- per-page meta
  id, restaurant_id, page_key, locale, title, description, og_image_url,
  noindex boolean
  unique (restaurant_id, page_key, locale)
```

**Fallback rule (no invented content):** when a row is absent, the page renders
the existing coded copy (which is real and already approved) rather than a
placeholder. When the admin adds a row, it takes over. This makes the migration
non-breaking and lets content move to the DB gradually.

### 2.2 Bilingual strategy

Store one row **per locale**. Arabic is not a translation of English by machine;
staff author both. When an `ar` row is missing, fall back to `en` and set
`lang="en"` on that fragment so screen readers and the RTL layout stay honest.

### 2.3 Safety & validation

- `page_content.body` is stored as **restricted markdown** (paragraphs, `**bold**`,
  `*italic*`, lists, links with an allow-listed scheme). Rendered through a small
  sanitiser, never `dangerouslySetInnerHTML` on raw input. Admin is trusted, but
  defence in depth is cheap here.
- All money/ETA values validated against the same zod schemas the order flow uses.
- Every table gets: `restaurant_id` default (single-tenant today), RLS with
  `_public_read` (published + active) and `_staff_write` (via
  `current_staff_role()`), a `sort_order` index, and a `touch_updated_at` trigger.

---

## 3. Admin surface for the new content

Extend `/admin` (English-only, as today) with one consolidated editor:

- **`/admin/content`** — tabbed editor for `page_content` + `page_seo`, grouped
  by page, side-by-side EN/AR, with a publish toggle and a preview link.
- **`/admin/faqs`** — CRUD with ordering and publish state.
- **`/admin/delivery`** — zones + fee/free-over/ETA; keeps the global fallback.
- **`/admin/announcements`** — promo bar, schedule (starts/ends), tone, link.

Each uses the existing `AdminForm` + `useErrorText` kit so error handling and
audit logging are consistent. All writes go through `src/lib/actions/admin.ts`
(audited via `log_audit_event`), never direct client writes.

---

## 4. Design system plan (Phase 4)

The brief specifies: deep ink/charcoal, vermilion/terracotta, warm gold, rice
paper, generous white space, Japanese/Korean/Chinese-inspired minimalism,
restrained motion, IBM Plex Sans Arabic + Noto Kufi Arabic (Arabic display),
premium decorative Latin/Asian serif, large hero, clear pricing, accessible.

### 4.1 Token reconciliation

Today's `@theme` in `globals.css` uses `rice/ink/bamboo/miso/plum/jade/chili`.
The brief names `--ink/--vermilion/--gold/--rice/--surface/--muted/--border`.
These are the same *family* with different names/values. Plan: keep the existing
semantic names (used in ~40 components) and **add the brief's names as aliases**
that map onto them, so nothing rebases and both vocabularies work. Introduce a
small set of semantic tokens (`--surface`, `--surface-muted`, `--border-subtle`,
`--text-primary`, `--text-muted`, `--accent`, `--accent-strong`) and migrate
components to the semantic layer over time.

### 4.2 Typography

Add a decorative display serif for section headings with a real Asian-adjacent
feel, and a heavier Arabic display face:

- Latin display (already `Fraunces`) → keep, tune weights.
- Arabic display: add **Noto Kufi Arabic** (next/font, `--font-arabic-display`),
  used only for headings; body Arabic stays IBM Plex Sans Arabic.
- Fluid type scale for h1–h4 and body, with `clamp()`.

### 4.3 Motion (restrained, purposeful)

A single `MotionProvider`/CSS layer with: hero entrance (once), section reveal on
scroll via `IntersectionObserver`, card hover lift (subtle), marquee/ken-burns
only on the hero image, and full `prefers-reduced-motion` opt-out. No scroll
hijacking, no parallax that fights reading. Animation budget and rationale written
into `docs/design-system.md`.

### 4.4 Mascot

- Keep `page-mascot` sprite mascot (M1) as the character.
- Fix **D1**: remove the duplicate floating trigger. Plan: `PandaAssistant` loses
  its own floating button; `FloatingPanda` becomes the single trigger that calls
  `openAssistant()`. One panda, one tap target.
- Resolve **D3**: replace the assistant's hand-drawn `PandaMascot` SVG with the
  sprite (`page-mascot`) so there is exactly one character, per the brief. The
  assistant panel header will show the sprite at a small size; the 12-state SVG
  expression system is dropped. `PandaState` mapping moves to the sprite's
  reaction frames.
  - **Need your confirmation** — see §8, Decision B.

---

## 5. i18n plan

- New content keys resolve through a DB-first, dictionary-fallback resolver:
  `resolveCopy(pageKey, sectionKey, locale)` → DB row → dictionary → none.
- Admin-authored content is never run through the dictionary; it is its own
  source of truth.
- `AppError.message` (baseline: English-only) becomes locale-aware by moving the
  user-facing message to a dictionary keyed by error code, with the server
  returning only the code + requestId. This closes the known i18n gap.

---

## 6. API / server plan

The brief asks whether the app needs a separate API worker for functions. Position:

- **Mutations already are the API**: they are Next **server actions**
  (`src/lib/actions/*`), which is idiomatic and already audited. The only HTTP
  route is `/api/analytics`.
- **No new API worker is warranted** for content CRUD: server actions cover it,
  run on the same Worker, and avoid a second deployment to keep in sync.
- Cases that *would* justify a worker: long-running jobs (exports/backups),
  webhooks from third parties, or a public read API for the menu. Exports/backups
  are already handled by Postgres RPCs.
- **Recommendation:** add a single tiny `GET /api/health` route (deployment +
  dependency status, no secrets) for monitoring, and otherwise keep server
  actions. This gives you a health signal without a second service.

---

## 7. Migration & rollout plan

1. Phase 3 (this doc) → **your approval**.
2. Phase 4a: schema migration (new tables + RLS + indexes) applied to a
   **Supabase branch / local reset** first; verified with `supabase db diff`.
3. Phase 4b: services + admin editors (read/write), with dictionary fallback so
   the live site is unchanged until content is entered.
4. Phase 4c: design tokens + typography + motion + mascot fixes (D1/D3).
5. Phase 5: no-redirect/SEO/JSON-LD/robots/sitemap/Lighthouse pass.
6. Phase 6: regression + E2E + admin-controls-everything matrix.
7. Phase 7: preview deploy → verify → production; final report.

Every phase is a separate commit, pushed to `feature/panda-wok-platform`, and
deployed to a **preview** URL before production.

---

## 8. Decisions needed before Phase 4

**Decision A — content tables.** Approve creating `page_content`, `faqs`,
`delivery_zones`, `announcements`, `page_seo` (4–5 new tables) as described, with
a dictionary fallback so nothing breaks? Alternative: fold long-form copy into
`settings` rows only (simpler, worse UX, no locale/order/publish).

**Decision B — mascot.** Replace the assistant's hand-drawn SVG panda (M2) with
the `page-mascot` sprite so there is exactly one character and no code-drawn SVG
mascot remains? Alternative: keep M2 as a separate "assistant" illustration if you
consider it out of scope of "the mascot." I will not invent any new character
either way.

**Decision C — Contact details.** `support.phone / whatsapp / email / social /
opening_hours` are currently empty in the DB (that is why contact/footer show
empty states). Do you have the real number(s) and socials to seed, or should I
leave them empty and let staff enter them in `/admin/settings`? I will not
invent them. (The number `+1 415 555 2671` seen in the brief appears to be a
placeholder test number.)

**Decision D — `/loyalty` redirect.** `/loyalty` is auth-gated today (307 to
sign-in) but is linked from the header. The brief's "no redirects" list does not
include `/loyalty`. Keep it gated (recommended: loyalty is personal), or make it
public with a sign-in CTA?

---

## 9. Phase 3 status

✅ Mock-content audit re-run: 0 fabricated items; extras limit (max 2) enforced in
the client (`modifier-selection.ts`, unit-tested) **and** server
(`place_order` via `20260923205905_modifier_limit_enforcement.sql`); the cart
renders every selected extra with its price delta.
✅ Architecture, content model, RLS, admin surface, design/motion/mascot, i18n and
API plan written.
⏸ **Paused for your approval on Decisions A–D.** Phase 4 does not start until you
confirm (A and B are blocking; C and D can be answered later but are cleaner now).
