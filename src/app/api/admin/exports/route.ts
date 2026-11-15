import { adminJson } from "@/lib/admin/api";
import { listExports } from "@/lib/services/admin-catalog";
import { getExportDownloadUrls } from "@/lib/export/download";

/** Export history plus signed fallback URLs for legacy storage-backed rows. */
export async function GET() {
  return adminJson("exports.manage", async () => {
    const exports = await listExports(50);
    const legacyPaths = exports
      .filter((record) => record.status === "ready" && !record.content_encoding && record.storage_path)
      .map((record) => record.storage_path as string);
    const downloadUrls = await getExportDownloadUrls(legacyPaths);
    return { exports, downloadUrls };
  });
}
