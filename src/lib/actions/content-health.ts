"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";

const CONTENT_TABLES = [
  "page_content",
  "faqs",
  "delivery_zones",
  "announcements",
  "page_seo",
] as const;

/**
 * True when every content table is reachable by the caller. The admin content
 * page uses this to distinguish "not migrated here" from "migrated but empty" —
 * the two look identical to a plain select that returns no rows.
 */
export async function contentTablesReady(): Promise<boolean> {
  await assertCapability("settings.manage");
  const supabase = await createServerSupabase();
  const checks = await Promise.all(
    CONTENT_TABLES.map((table) =>
      supabase.from(table).select("id", { count: "exact", head: true }),
    ),
  );
  return checks.every((check) => !check.error);
}
