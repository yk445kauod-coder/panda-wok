import { describe, expect, it } from "vitest";
import { createAdminSupabase } from "@/lib/supabase/server";
import { exportDeliverable } from "@/lib/agent/deliverables";

/**
 * Live end-to-end: render each office format from the real database, store it
 * in the `artifacts` bucket, then clean up every row and object it created.
 *
 * Opt-in via OFFICE_LIVE=1 because it writes to the live project's storage and
 * needs the service-role key.
 */
const enabled = process.env.OFFICE_LIVE === "1";

describe.skipIf(!enabled)("deliverable office export (live)", () => {
  const created: { id: string; path: string }[] = [];

  it(
    "exports xlsx, docx and pdf from live data",
    async () => {
      const admin = createAdminSupabase();

      for (const format of ["xlsx", "docx", "pdf"] as const) {
        const result = await exportDeliverable({
          kind: "daily_sales",
          format,
          createdBy: null,
        });
        created.push({ id: result.id, path: result.path });
        expect(result.bytes).toBeGreaterThan(500);

        const { data: row } = await admin
          .from("agent_artifacts")
          .select("format, status, bytes, storage_path")
          .eq("id", result.id)
          .single();
        expect(row?.format).toBe(format);
        expect(row?.status).toBe("ready");
        expect(row?.bytes).toBe(result.bytes);

        const { data: blob, error } = await admin.storage
          .from("artifacts")
          .download(result.path);
        expect(error).toBeNull();
        expect(blob?.size).toBe(result.bytes);

        const buffer = Buffer.from(await blob!.arrayBuffer());
        if (format === "pdf") {
          expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        } else {
          expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
        }
      }
    },
    60_000,
  );

  it("cleans up", async () => {
    const admin = createAdminSupabase();
    for (const { id, path } of created) {
      await admin.storage.from("artifacts").remove([path]);
      await admin.from("agent_artifacts").delete().eq("id", id);
    }
    const { count } = await admin
      .from("agent_artifacts")
      .select("id", { count: "exact", head: true })
      .in(
        "id",
        created.map((c) => c.id),
      );
    expect(count).toBe(0);
  });
});
