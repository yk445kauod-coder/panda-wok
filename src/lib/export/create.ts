import "server-only";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildExport,
  exportObjectPath,
  isExportDataset,
  type ExportDataset,
} from "@/lib/export/build";

/**
 * The one implementation of "produce a dataset export".
 *
 * It was previously inline in `requestExportAction`, which meant the ops agent
 * could not reuse it without either duplicating the upload/status dance or
 * calling a server action from the server. Extracting it keeps a single path for
 * both a human in the Exports screen and an approved agent proposal: create the
 * job row first (so a failure is auditable), build the file, upload it, then flip
 * the row to ready. A caller must have already passed its capability check.
 */

export type ExportJobResult = { id: string; rows: number };

export async function createExportJob(params: {
  dataset: ExportDataset;
  format: "csv" | "json";
  /** Null is honest for a passcode-gated owner with no auth user row. */
  requestedBy: string | null;
}): Promise<ExportJobResult> {
  const admin = createAdminSupabase();

  const { data: job, error: createError } = await admin
    .from("exports")
    .insert({
      dataset: params.dataset,
      format: params.format,
      status: "running",
      requested_by: params.requestedBy,
    })
    .select("id")
    .single();

  if (createError || !job) {
    throw new Error(createError?.message ?? "Could not queue the export.");
  }

  try {
    const built = await buildExport({ dataset: params.dataset, format: params.format });
    const path = exportObjectPath(job.id, built.extension);

    const { error: uploadError } = await admin.storage
      .from("exports")
      .upload(path, built.body, { contentType: built.mime, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: finishError } = await admin
      .from("exports")
      .update({
        status: "ready",
        row_count: built.rows,
        bytes: Buffer.byteLength(built.body, "utf8"),
        storage_path: path,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (finishError) throw new Error(finishError.message);

    return { id: job.id, rows: built.rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The export could not be built.";
    await admin
      .from("exports")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", job.id);
    throw error instanceof Error ? error : new Error(message);
  }
}

export { isExportDataset, type ExportDataset };
