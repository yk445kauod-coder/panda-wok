import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * Signed, short-lived download URLs for finished exports. The bucket is
 * private, so a raw storage path is not usable by the browser; this mints one
 * signed URL per ready row at page render time.
 */
export async function getExportDownloadUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const admin = tryCreateAdminSupabase();
  if (!admin || paths.length === 0) return {};

  const { data, error } = await admin.storage
    .from("exports")
    .createSignedUrls(paths, 60 * 60);

  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}
