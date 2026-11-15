import "server-only";

import { tryCreateAdminSupabase } from "@/lib/supabase/server";

/**
 * Signed, short-lived download URLs for finished backups. The bucket is
 * private, so the browser cannot read a raw storage path; one signed URL is
 * minted per ready row at page render time.
 */
export async function getBackupDownloadUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const admin = tryCreateAdminSupabase();
  if (!admin || paths.length === 0) return {};

  const { data, error } = await admin.storage
    .from("backups")
    .createSignedUrls(paths, 60 * 60);

  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}
