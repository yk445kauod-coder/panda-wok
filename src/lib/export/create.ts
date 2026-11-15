import "server-only";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildExport,
  isExportDataset,
  type ExportDataset,
  type ExportFormat,
} from "@/lib/export/build";

/**
 * The one implementation of "produce a dataset export".
 *
 * It was previously inline in `requestExportAction`, which meant the ops agent
 * could not reuse it without either duplicating the upload/status dance or
 * calling a server action from the server. Extracting it keeps a single path for
 * both a human in the Exports screen and an approved agent proposal: create the
 * job row first (so a failure is auditable), build the file, then flip the row
 * to ready.
 *
 * The bytes are stored **locally** in the `exports.content` column rather than
 * uploaded to Supabase Storage. That is the owner's call: keeping the work on
 * our own database avoids cloud object churn and egress on a free plan, and the
 * file is streamed straight back by an admin route. The `storage_path` column
 * still exists for rows written before this change.
 */

export type ExportJobResult = { id: string; rows: number };

export async function createExportJob(params: {
  dataset: ExportDataset;
  format: ExportFormat;
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

    const { error: finishError } = await admin
      .from("exports")
      .update({
        status: "ready",
        row_count: built.rows,
        bytes: Buffer.byteLength(built.body, "utf8"),
        content: built.body,
        content_encoding: built.encoding,
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
