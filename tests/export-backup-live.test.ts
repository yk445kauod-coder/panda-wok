import { afterAll, describe, expect, it } from "vitest";
import { createAdminSupabase } from "@/lib/supabase/server";
import { buildExport } from "@/lib/export/build";
import { buildBackup } from "@/lib/backup/build";
import { fileResponse } from "@/lib/files/download";

/**
 * Live probe: build one export and one backup of each new format against the
 * real project, confirm the stored bytes decode to the right artefact, and
 * clean up every row afterwards. Skipped unless EXPORT_LIVE=1 so the normal
 * suite never touches production.
 */
const live = process.env.EXPORT_LIVE === "1";
const createdExports: string[] = [];
const createdBackups: string[] = [];

afterAll(async () => {
  if (!live) return;
  const admin = createAdminSupabase();
  if (createdExports.length) await admin.from("exports").delete().in("id", createdExports);
  if (createdBackups.length) await admin.from("backup_records").delete().in("id", createdBackups);
});

describe.skipIf(!live)("live export/backup formats", () => {
  it("builds an xlsx export and stores it locally", async () => {
    const admin = createAdminSupabase();
    const built = await buildExport({ dataset: "orders", format: "xlsx" });
    expect(built.encoding).toBe("base64");
    const bytes = Buffer.from(built.body, "base64");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const { data, error } = await admin
      .from("exports")
      .insert({ dataset: "orders", format: "xlsx", status: "ready", content: built.body, content_encoding: "base64" })
      .select("id, dataset, format, content, content_encoding, created_at")
      .single();
    expect(error).toBeNull();
    createdExports.push(data!.id);

    const response = fileResponse(data);
    expect(response?.headers.get("content-type")).toContain("spreadsheetml");
    expect(response?.headers.get("content-disposition")).toContain(".xlsx");
  });

  it("builds a txt export and stores it locally", async () => {
    const admin = createAdminSupabase();
    const built = await buildExport({ dataset: "menu", format: "txt" });
    expect(built.encoding).toBe("utf8");
    expect(built.body).toContain("Panda Wok");

    const { data } = await admin
      .from("exports")
      .insert({ dataset: "menu", format: "txt", status: "ready", content: built.body, content_encoding: "utf8" })
      .select("id, dataset, format, content, content_encoding, created_at")
      .single();
    createdExports.push(data!.id);
    expect(fileResponse(data)?.headers.get("content-type")).toContain("text/plain");
  });

  it("builds a readable backup workbook and text report", async () => {
    const admin = createAdminSupabase();
    const xlsx = await buildBackup({ kind: "menu", label: "probe", format: "xlsx" });
    expect(xlsx.encoding).toBe("base64");
    expect(Buffer.from(xlsx.body, "base64").byteLength).toBeGreaterThan(500);

    const txt = await buildBackup({ kind: "menu", label: "probe", format: "txt" });
    expect(txt.body).toContain("backup (menu)");

    const { data } = await admin
      .from("backup_records")
      .insert({ kind: "menu", status: "ready", format: "xlsx", content: xlsx.body, content_encoding: "base64" })
      .select("id")
      .single();
    createdBackups.push(data!.id);
    expect(data!.id).toBeTruthy();
  });
});
