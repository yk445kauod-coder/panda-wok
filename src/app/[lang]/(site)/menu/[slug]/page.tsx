import { MenuSlugPage } from "@/components/customer/menu-slug-page";
import { getMenuSlugs } from "@/lib/services/catalog";
import { LOCALES } from "@/lib/i18n/config";

export const dynamic = "force-static";

/**
 * Static shell. The slug is resolved on the client (category or dish) from
 * `/api/public/menu/<slug>`, so the Worker serves a constant document instead
 * of awaiting the catalogue and rendering up to 90 dishes.
 *
 * Every slug is prerendered. Without this the route was `force-static` but had
 * no params to build, so each of the ~90 slugs x 2 locales was a *cold on-demand
 * render* the first time anyone opened it — and a cold render is what exceeds
 * the Free plan's 10 ms CPU ceiling (Error 1102). The shells are byte-identical
 * per locale except for the slug in the RSC payload, so prerendering them turns
 * 180 potential cold renders into static assets the CDN answers directly.
 *
 * The slug list comes from `getMenuSlugs`, which reads the bundled last-known-
 * good catalogue at build time (no KV, no request), so a restricted database
 * cannot fail the build. A dish added later is not in the list; it renders on
 * demand once and is then edge-cached like any other page.
 */
export async function generateStaticParams() {
  try {
    const { categories, items } = await getMenuSlugs();
    const slugs = new Set<string>([
      ...categories.map((c) => c.slug),
      ...items.map((i) => i.slug),
    ]);
    return LOCALES.flatMap((lang) =>
      [...slugs].map((slug) => ({ lang, slug })),
    );
  } catch {
    // A build must not fail on a data read; the pages still render on demand.
    return [];
  }
}

export default function Page() {
  return <MenuSlugPage />;
}
