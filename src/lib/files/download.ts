import "server-only";

/**
 * Turns a stored export/backup row into a downloadable HTTP response.
 *
 * Files are kept **locally** — the bytes live in the row's `content` column, so
 * no object storage is involved. `content_encoding` says how they are stored:
 * `utf8` for text (txt/csv/json) and `base64` for the binary XLSX workbook.
 */

type ContentRow = {
  dataset?: string;
  kind?: string;
  format: string;
  content: string | null;
  content_encoding: string | null;
  created_at: string;
};

/** A stable, human filename: dataset-or-kind plus the date, with the extension. */
function filename(row: ContentRow): string {
  const base = (row.dataset ?? row.kind ?? "export").replace(/[^a-z0-9_-]/gi, "-");
  const stamp = row.created_at.slice(0, 10);
  return `panda-wok-${base}-${stamp}.${row.format}`;
}

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Builds the Response, or null when the row carries no local content. */
export function fileResponse(row: ContentRow | null): Response | null {
  if (!row || row.content == null) return null;

  const body =
    row.content_encoding === "base64" ? Buffer.from(row.content, "base64") : row.content;

  const headers = new Headers({
    "content-type": CONTENT_TYPES[row.format] ?? "application/octet-stream",
    "content-disposition": `attachment; filename="${filename(row)}"`,
    // A private, per-session file must never be cached by a shared cache.
    "cache-control": "private, no-store",
  });

  return new Response(body, { headers });
}

export type { ContentRow as FileContentRow };
