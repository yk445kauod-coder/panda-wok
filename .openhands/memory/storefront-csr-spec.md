# Storefront CSR conversion spec (read fully before editing)

## Goal
Every customer page under `src/app/[lang]/(site)/**` must become a **static
shell** so the Cloudflare Worker stops server-rendering it. The Worker's Free
plan caps CPU at 10 ms per request; SSR of the catalogue blows it (Error 1102).
Data now arrives from JSON API routes the browser fetches.

## The pattern (menu + about are the finished references)
- `src/components/customer/menu-page.tsx` — converted client page (uses store).
- `src/components/customer/about-page.tsx` — converted client page (store + content API).
- `src/app/[lang]/(site)/menu/page.tsx` — thin server shell:

```tsx
import { Suspense } from "react";
import { MenuPage } from "@/components/customer/menu-page";

export default function Page() {
  return (
    <Suspense>
      <MenuPage />
    </Suspense>
  );
}
```

## Rules (MUST follow)
1. The client component starts with `"use client";` and lives at
   `src/components/customer/<name>-page.tsx`. It must NOT import any module that
   has `import "server-only"`. Server-only modules include:
   `@/lib/services/catalog` (runtime), `@/lib/services/content` (runtime),
   `@/lib/services/orders`, `@/lib/services/order-status`, `@/lib/auth/session`,
   `@/lib/actions/*`, `@/lib/crm/*`, `@/lib/ai/*`, `@/lib/export/*`, `@/lib/backup/*`,
   `@/lib/i18n/server`.
   - You MAY import **types** from them: `import type { MenuItem } from "@/lib/services/catalog";`
   - `@/lib/i18n/static`, `@/lib/i18n/brand`, `@/lib/i18n/catalog`,
     `@/lib/services/store-hours`, `@/lib/utils/format`, `@/lib/seo/*`,
     `@/components/seo/json-ld`, `@/components/icons/social`,
     `@/lib/services/checkout-math` are client-safe.
2. No `staticT`/`getT`. Use `const { t } = useI18n();` from `@/components/i18n-provider`.
   For the locale use `const { data } = useStore()` → `data.locale`.
3. For link building use `const lp = useLocalePath();` from `@/components/i18n-hooks`
   (replaces `localePath(locale, "/x")`).
4. Data sources:
   - Catalogue + shell: `const { data, loading, error } = useStore();`
     from `@/components/customer/store-data`. `data` = `{ locale, settings, flags,
     restaurant, categories, menu, ratings, featured, announcements }`.
     `menu` = `{ categories, items }`.
   - Owner-edited copy: `usePublicData<{ sections: PageSection[] }>("/api/public/content", { page, locale })`.
   - Signed-in customer: `usePublicData<...>("/api/public/me", ...)` or
     `/api/public/me/orders`; pass `{ onUnauthorized: () => router.replace(lp("/auth/sign-in?next=...")) }`.
   - Render `<PageLoading />` from `@/components/ui/page-states` while
     `loading && !data`; render nothing (`return null`) if `!data` after loading.
5. No `generateMetadata` reading the DB. Keep a static `generateMetadata` only if
   it uses no server data; otherwise delete it. `export const dynamic` is REMOVED.
6. Preserve every rendered string and `t("...")` key EXACTLY. Do not invent keys.
   Do not invent data.
7. Keep the JSX/className structure of the original where possible; only replace
   the data source, the locale source and the auth source.
8. Server actions keep working (client-side already). Do not touch them.
9. Redirects: a server page's `redirect()` becomes a client
   `router.replace(...)` inside an effect when the API answers 401, OR a
   `<Redirect>` guard. Never call `redirect()` from a client component.

## Available API endpoints
- `GET /api/public/bootstrap?locale=en|ar` → `{ locale, settings, flags, restaurant, categories, menu, ratings, featured, announcements }`
- `GET /api/public/content?page=<key>&locale=<loc>` → `{ locale, page, sections, announcements }`
- `GET /api/public/me` → `{ profile, isStaff, stats, orders, addresses }` (401 if signed out)
- `GET /api/public/me/orders?limit=N` → `{ orders }` (401 if signed out)

## Known traps
- `useSearchParams()` forces the shell into `<Suspense>`.
- `formatPrice/formatDate/formatDateTime/humanise/cn/formatNumber` from
  `@/lib/utils/format` are client-safe.
- `Reveal`, `Badge`, `EmptyState`, `Breadcrumbs`, `BrandLogo`, charts are client-safe.
- The `(site)/layout.tsx` no longer renders `JsonLdScript`; structured data that
  needs live data must be emitted by a client component if still wanted, but it
  is NOT required for the conversion to be correct.
