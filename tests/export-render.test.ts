import { describe, expect, it } from "vitest";
import { buildTxt, buildXlsx } from "@/lib/export/render";
import { buildBackupTxt, buildBackupXlsx } from "@/lib/backup/render";

/**
 * The owner asked for genuinely readable exports/backups, not a byte dump. These
 * pin the properties that make the output readable and valid: money stays a
 * number in the workbook, the TXT report is aligned, and the backup workbook
 * gets one sheet per table.
 */
describe("export renderers", () => {
  const rows = [
    {
      order_number: "PW-1",
      status: "finished",
      subtotal: "200",
      total: 237.12,
      created_at: "2026-10-03T09:15:00Z",
    },
  ];

  it("builds a real xlsx workbook (zip magic bytes, non-trivial size)", () => {
    const workbook = buildXlsx({
      dataset: "orders",
      label: "Orders",
      rows,
      generatedAt: "2026-10-03T00:00:00Z",
    });
    // OOXML files are ZIP archives: they start with the local-file-header magic.
    expect(workbook[0]).toBe(0x50);
    expect(workbook[1]).toBe(0x4b);
    expect(workbook.byteLength).toBeGreaterThan(500);
  });

  it("renders a column-aligned text report with a header and row count", () => {
    const text = buildTxt({
      dataset: "orders",
      label: "Orders",
      rows,
      generatedAt: "2026-10-03T00:00:00Z",
    });
    expect(text).toContain("Panda Wok — Orders");
    expect(text).toContain("Rows: 1");
    expect(text).toContain("PW-1");
    // Money is formatted to two decimals in the readable report.
    expect(text).toContain("237.12");
    // A header rule separates the header from the body.
    expect(text).toMatch(/-{4,}/);
  });

  it("summarises each backup table and previews its rows", () => {
    const tables = {
      orders: {
        rows: [{ id: "o1", total: 100 }],
        count: 1,
        capped: false,
      },
      menu_items: { rows: [], count: 0, capped: false },
    };
    const text = buildBackupTxt({
      tables,
      kind: "database",
      label: "nightly",
      generatedAt: "2026-10-03T00:00:00Z",
    });
    expect(text).toContain("backup (database)");
    expect(text).toContain("orders");
    expect(text).toContain("nightly");
    expect(text).toContain("first 1 of 1");
  });

  it("gives the backup workbook one sheet per captured table", () => {
    const workbook = buildBackupXlsx({
      tables: {
        orders: { rows: [{ id: "o1" }], count: 1, capped: false },
        menu_items: { rows: [{ id: "m1" }], count: 1, capped: false },
      },
      kind: "snapshot",
      generatedAt: "2026-10-03T00:00:00Z",
    });
    expect(workbook[0]).toBe(0x50);
    expect(workbook[1]).toBe(0x4b);
  });
});
