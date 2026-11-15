import { adminJson } from "@/lib/admin/api";
import { listBackups } from "@/lib/services/admin-catalog";
import { getBackupDownloadUrls } from "@/lib/backup/download";

/** Backup history plus signed fallback URLs for legacy storage-backed rows. */
export async function GET() {
  return adminJson("backups.view", async () => {
    const backups = await listBackups(50);
    const downloadUrls = await getBackupDownloadUrls(
      backups
        .filter((record) => record.status === "ready" && !record.content_encoding && record.storage_path)
        .map((record) => record.storage_path as string),
    );
    return { backups, downloadUrls };
  });
}
