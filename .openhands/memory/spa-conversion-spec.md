# Admin SPA conversion spec (read fully before editing)

## Goal
`/admin/*` pages must become **static shells** so the Cloudflare Worker stops
server-rendering the console. Each page's data now comes from a JSON API route
under `/api/admin/*` that the browser fetches.

## The pattern (crm-home is the finished reference)
- `src/components/admin/pages/crm-home.tsx` — the converted client page.
- `src/app/admin/crm/page.tsx` — the thin server shell:

```tsx
import { Suspense } from "react";
import { CrmHomePage } from "@/components/admin/pages/crm-home";

export default function Page() {
  return (
    <Suspense>
      <CrmHomePage />
    </Suspense>
  );
}
```

## Rules (MUST follow)
1. The new client component file starts with `"use client";` and lives at
   `src/components/admin/pages/<name>.tsx`. It **must NOT import** anything from
   a `server-only` module. Server-only modules include: `@/lib/auth/session`,
   `@/lib/crm/customers`, `@/lib/crm/insights`, `@/lib/services/*`,
   `@/lib/i18n/server`, `@/lib/actions/*`, `@/lib/export/*`, `@/lib/backup/*`,
   `@/lib/ai/*`.
   - You MAY import **types** from them with `import type { X } from "..."`.
   - Any runtime helper the page needs from those modules must instead be
     returned by the API route (see the endpoints list).
2. No `getT`/`getAdminLocale`. Use `const t = useT();` from
   `@/components/i18n-provider`.
3. No `requireCapability` — the API route enforces it. To know the role use
   `const { role } = useAdminSession();` from `@/components/admin/admin-session`.
4. Query params: use `useSearchParams()` from `next/navigation`. Because of
   that, the server shell MUST wrap the client component in `<Suspense>`.
5. Fetch with the hook: `const { data, loading, error, reload } =
   useAdminData<T>("/api/admin/<x>", { q, page });` from `@/lib/admin/client`.
   Render `<PageLoading />` from `@/components/admin/page-states` while
   `loading && !data`; render `<PageError message={error} />` if `error && !data`.
   If `data` is null (e.g. a detail route returned nothing) render a
   "not found" panel using `t("admin.common.notFound")` /
   `t("admin.common.notFoundBody")` — do NOT call `notFound()`.
6. For live boards (orders list, kitchen) add
   `useAdminPoll(reload, 8000)` from `@/lib/admin/client`.
7. `export const dynamic = "force-dynamic"` is REMOVED from the page shell.
8. **Preserve every rendered string and every translation key** exactly as the
   original used them (`t("...")`). Do not invent new keys. The only allowed new
   keys are `admin.common.notFound`, `admin.common.notFoundBody`,
   `admin.common.errorTitle`, `admin.common.errorBody`, `admin.common.retry`
   (already added to the dictionaries).
9. Keep the JSX/className structure of the original page byte-for-byte where
   possible; only replace the data source, the locale source and the auth source.
10. Server actions (forms) keep working — they are already client-side. Do not
    touch them.

## Available API endpoints (already implemented — do NOT create new ones unless told)
- `GET /api/admin/overview` → `{ metrics, acceptingOrders }`  (capability orders.view)
- `GET /api/admin/analytics` → `{ metrics, funnel }`  (analytics.view)
- `GET /api/admin/orders?status&q&page` → `{ orders, counts, total, status, page, pageSize, q }`  (orders.view)
- `GET /api/admin/orders/<orderId>` → `AdminOrderDetail | null`  (orders.view)
- `GET /api/admin/kitchen` → `{ fresh, cooking, ready, dispatching }`  (kitchen.view)
- `GET /api/admin/menu?edit` → `{ categories, items, editing, modifierGroups }`  (menu.manage)
- `GET /api/admin/categories` → `AdminCategory[]`  (menu.manage)
- `GET /api/admin/offers` → `{ offers, customers }`  (menu.manage)
- `GET /api/admin/content` → `{ ready, sections, faqs, zones, announcements }`  (settings.manage)
- `GET /api/admin/crm?q` → `{ customers, stats }`  (crm.view)
- `GET /api/admin/crm/segments` → `{ segments, tags, tagCounts, valueLabels }`  (crm.view)
- `GET /api/admin/crm/activity?event&q` → `{ events }`  (crm.view)
- `GET /api/admin/crm/insights?days` → `{ days, report }`  (crm.view)
- `GET /api/admin/crm/<userId>` → `{ customer, orders, activity, feedback, staffRow, notes, tags, assignedTags, addresses, customerOffers }`  (crm.view). `customer` is `null` when absent.
- `GET /api/admin/feedback?status&category&q&page` → `{ feedback, total, page, pageSize, status, category, q }`  (feedback.manage)
- `GET /api/admin/users?q&role&page` → `{ customers, total, staff, roles, page, pageSize, roleFiltered, q, role }`  (users.manage)
- `GET /api/admin/exports` → `{ exports, downloadUrls }`  (exports.manage)
- `GET /api/admin/backups` → `{ backups, downloadUrls }`  (backups.view)
- `GET /api/admin/settings` → `{ flags, settings, acceptingOrders, hours }`  (settings.manage)
- `GET /api/admin/guide` → `{ role, capabilities }`  (unlocked)
- `GET /api/admin/denied` → `{ role, capabilities }`  (unlocked)

## Known traps
- `Pagination` (`@/components/ui/pagination`) renders `<Link href>` from
  `basePath` + `searchParams`. It works as-is in a client component — keep it.
- `formatNumber/formatPrice/formatDate/formatDateTime/humanise/safeJson/cn` from
  `@/lib/utils/format` are client-safe — keep using them.
- Charts (`TrendChart`, `DonutChart`, `BarList`, `GaugeChart`, `RadarChart`,
  `Heatmap`, `Sparkline`) are client components — keep using them.
- `localiseGuideSections`, `GUIDE_SECTIONS`, `GUIDE_TOPICS`, `GUIDE_ROLE_ORDER`
  from `@/lib/admin/guide(.ar)` are NOT server-only — safe to import in a client
  component.
- `capabilitiesFor` from `@/lib/auth/rbac` is NOT server-only — safe to import.
- Do not import `listActivity`, `segmentOverview`, `SEGMENT_VALUE_LABELS` etc.
  from `@/lib/crm/customers` at runtime (server-only). They come from the API.
