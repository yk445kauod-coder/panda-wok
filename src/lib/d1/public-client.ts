/**
 * The D1 client for public, cookie-free reads.
 *
 * `createPublicSupabase()` returns this when `DATA_BACKEND=d1`, so the customer
 * storefront — menu, categories, settings, content — reads from D1 instead of
 * the Supabase project whose egress quota is spent. Without this the public
 * reads kept hitting Supabase (402) and the storefront only survived on a stale
 * KV/cache snapshot, so an admin menu edit never reached a customer.
 *
 * It deliberately does not read `next/headers`. The public reads also run at
 * build time (`generateStaticParams`, prerendering), and a header read there
 * would force every storefront page dynamic. With no request there is no D1
 * binding, the read throws, and the catalogue's last-known-good backup serves
 * the page — the bundled seed at build time, the KV snapshot at runtime.
 *
 * `elevated: false` is the honest identity: an anonymous visitor. D1 has no RLS,
 * so the query's own filters (`is_enabled`, `is_published`, `is_public`) are the
 * boundary — which is exactly what the storefront queries already carry.
 */

import { D1Client } from "@/lib/d1/client";
import { bindD1FromCloudflare, setD1Context } from "@/lib/d1/database";

const DEFAULT_RESTAURANT_ID = "b54b2620-90c5-4295-b617-bc1389db3ee9";

export function createD1PublicClient(): D1Client {
  bindD1FromCloudflare();
  setD1Context({ elevated: false, userId: null, restaurantId: DEFAULT_RESTAURANT_ID });
  return new D1Client({ elevated: false, userId: null });
}
