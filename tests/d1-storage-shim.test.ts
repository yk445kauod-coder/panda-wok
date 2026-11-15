/**
 * The D1 client must answer the `supabase.storage` surface without throwing.
 *
 * The bug this guards: the exports and backups screens mint signed download
 * URLs for legacy rows (`getExportDownloadUrls` / `getBackupDownloadUrls`), and
 * those helpers call `admin.storage.from(...).createSignedUrls(...)`. The D1
 * client had no `.storage`, so the call was a TypeError and both tabs answered
 * 500. D1 has no object storage, so the only correct answer is an empty list —
 * the screens then fall back to the status badge instead of erroring.
 */

import { describe, expect, it } from "vitest";
import { D1Client } from "@/lib/d1/client";
import { getExportDownloadUrls } from "@/lib/export/download";
import { getBackupDownloadUrls } from "@/lib/backup/download";

describe("D1Client storage shim", () => {
  const client = new D1Client({ elevated: true, userId: null });

  it("exposes a storage surface instead of undefined", () => {
    expect(client.storage).toBeDefined();
    expect(typeof client.storage.from).toBe("function");
  });

  it("createSignedUrls resolves to an empty list, never throws", async () => {
    const { data, error } = await client.storage.from("exports").createSignedUrls(["a/b"], 60);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("upload reports a graceful error rather than throwing", async () => {
    const { error } = await client.storage.from("menu-images").upload("x.png", new Blob());
    expect(error?.message).toMatch(/not available/i);
  });
});

describe("download-URL helpers on the D1 backend", () => {
  it("getExportDownloadUrls returns {} for legacy storage rows", async () => {
    expect(await getExportDownloadUrls(["01d4dafb-4c0f-4a97-ac47-653aa4"])).toEqual({});
  });

  it("getBackupDownloadUrls returns {} for legacy storage rows", async () => {
    expect(await getBackupDownloadUrls(["1ff2f261-f767-4953-9238-88a370"])).toEqual({});
  });
});
