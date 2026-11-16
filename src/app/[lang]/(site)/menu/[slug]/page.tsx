import { MenuSlugPage } from "@/components/customer/menu-slug-page";

export const dynamic = "force-static";

/**
 * Static shell. The slug is resolved on the client (category or dish) from
 * `/api/public/menu/<slug>`, so the Worker serves a constant document instead
 * of awaiting the catalogue and rendering up to 90 dishes.
 */
export default function Page() {
  return <MenuSlugPage />;
}
