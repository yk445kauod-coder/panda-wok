"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/components/customer/analytics-beacon";

/**
 * Fires a single ITEM_VIEW for the dish page. Mounting on the server-rendered
 * page keeps the HTML fully indexable while still recording the funnel step.
 */
export function ItemViewTracker({
  menuItemId,
  slug,
  name,
}: {
  menuItemId: string;
  slug: string;
  name: string;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent("ITEM_VIEW", { menu_item_id: menuItemId, slug, name });
  }, [menuItemId, slug, name]);

  return null;
}
