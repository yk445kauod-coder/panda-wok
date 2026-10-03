"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, tryCreateAdminSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";
import { logAudit } from "@/lib/activity/log";
import {
  actionError,
  actionFail,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import { opsAgentSettingsSchema, skillImportSchema } from "@/lib/validation/schemas";
import {
  applyOpsAction,
  persistOpsReport,
  runOpsReport,
} from "@/lib/agent/ops-agent";
import {
  createDeliverable,
  exportDeliverable,
  isDeliverableKind,
  isOfficeFormat,
} from "@/lib/agent/deliverables";
import { REPO_SKILL_SOURCES } from "@/lib/agent/repo-skills.generated";
import { importGithubSkills, syncSkillSources } from "@/lib/agent/skill-sources";
import { remember, backfillMemoryEmbeddings, deleteAgentMemory } from "@/lib/agent/memory";
import { addArtifactComment, markArtifactReused } from "@/lib/agent/library";

/**
 * Server actions for the owner-facing ops agent.
 *
 * The approval gate is the contract: `runAgentNowAction` only *observes and
 * proposes* — it can never apply anything. The only path that applies an effect
 * is `decideAgentActionAction`, and it requires the row to already be `approved`
 * and the actor to hold `ai.manage`. Even for an owner, approving reads the
 * stored payload rather than trusting anything from the browser.
 */

/**
 * Produces one deliverable on demand and stores it. This is the manual half of
 * the scheduled report: instead of only reading prose, the owner gets a real
 * file (a sales sheet, a menu-engineering report, a reorder CSV) they can open.
 */
export async function runDeliverableAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; title: string; rowCount: number }>> {
  const session = await assertCapability("ai.manage");

  const kind = String(formData.get("kind") ?? "").trim();
  if (!isDeliverableKind(kind)) {
    return actionFail("VALIDATION", "Unknown deliverable type.");
  }

  try {
    const result = await createDeliverable({ kind, createdBy: session.actorId });

    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.deliverable_created",
      entity: "agent_artifacts",
      entityId: result.id,
      after: { kind, rowCount: result.rowCount },
    });

    revalidatePath("/admin/agent");
    return actionOk({ id: result.id, title: result.title, rowCount: result.rowCount });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Exports a deliverable as a real file — PDF, Word or Excel.
 *
 * The body is re-rendered from live data rather than converted from a stored
 * file, so a PDF handed to the accountant today cannot disagree with the
 * dashboard. Office documents are RTL/Arabic-ready: the PDF embeds a font that
 * carries the shaped Arabic glyphs, and the Word/Excel parts carry the RTL
 * reading direction.
 */
export async function exportDeliverableAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; title: string; bytes: number }>> {
  const session = await assertCapability("ai.manage");

  const kind = String(formData.get("kind") ?? "").trim();
  const format = String(formData.get("format") ?? "").trim().toLowerCase();
  if (!isDeliverableKind(kind)) {
    return actionFail("VALIDATION", "Unknown deliverable type.");
  }
  if (!isOfficeFormat(format)) {
    return actionFail("VALIDATION", "Unknown export format.");
  }

  try {
    const result = await exportDeliverable({
      kind,
      format,
      createdBy: session.actorId,
    });

    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.deliverable_exported",
      entity: "agent_artifacts",
      entityId: result.id,
      after: { kind, format, bytes: result.bytes },
    });

    revalidatePath("/admin/agent");
    return actionOk({ id: result.id, title: result.title, bytes: result.bytes });
  } catch (error) {
    return actionError(error);
  }
}

/** Runs a report on demand, persisting it and queueing fresh proposals. */
export async function runAgentNowAction(): Promise<FormActionResult<{ runId: string }>> {
  const session = await assertCapability("ai.manage");
  const started = Date.now();

  try {
    const { report, provider, model } = await runOpsReport({
      trigger: "manual",
      proposalsEnabled: true,
    });
    const runId = await persistOpsReport({
      report,
      provider,
      model,
      trigger: "manual",
      durationMs: Date.now() - started,
    });

    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.run",
      entity: "ops_agent_runs",
      entityId: runId,
      after: { actions: report.actions.length, provider },
    });

    revalidatePath("/admin/agent");
    return actionOk({ runId });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Approves or rejects a proposal. Approval alone does not apply anything —
 * `apply` is a second, explicit step — so a misapproved action cannot fire as a
 * side effect of the decision.
 */
export async function decideAgentActionAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const actionId = String(formData.get("actionId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!actionId) return actionFail("VALIDATION", "Missing action id.");
  if (decision !== "approve" && decision !== "reject") {
    return actionFail("VALIDATION", "Decision must be approve or reject.");
  }

  const supabase = await createServerSupabase();
  const rpc = decision === "approve" ? "approve_ops_action" : "reject_ops_action";
  const { error } = await supabase.rpc(rpc, {
    p_id: actionId,
    p_note: note ?? undefined,
  });
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: `ops_agent.action_${decision}d`,
    entity: "ops_agent_actions",
    entityId: actionId,
    after: { note },
  });

  revalidatePath("/admin/agent");
  return actionOk();
}

/**
 * Applies an approved action. Reads the row itself, confirms it is `approved`,
 * then hands only the stored payload to the apply path. The browser cannot
 * influence what is sent.
 */
export async function applyAgentActionAction(
  formData: FormData,
): Promise<FormActionResult<{ ref: string }>> {
  const session = await assertCapability("ai.manage");

  const actionId = String(formData.get("actionId") ?? "").trim();
  if (!actionId) return actionFail("VALIDATION", "Missing action id.");

  const admin = tryCreateAdminSupabase();
  if (!admin) return actionFail("NOT_CONFIGURED", "Privileged storage is unavailable.");

  const { data: row, error: readError } = await admin
    .from("ops_agent_actions")
    .select("id,kind,title,rationale,payload,status")
    .eq("id", actionId)
    .maybeSingle();
  if (readError || !row) return actionFail("NOT_FOUND", "That action no longer exists.");
  if (row.status !== "approved") {
    return actionFail("VALIDATION", "Only an approved action can be applied.");
  }

  try {
    const { ref } = await applyOpsAction({
      id: row.id,
      kind: row.kind,
      title: row.title,
      rationale: row.rationale,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      approvedBy: session.actorId,
    });

    await admin
      .from("ops_agent_actions")
      .update({ status: "applied", applied_at: new Date().toISOString(), applied_ref: ref })
      .eq("id", actionId);

    await logAudit(admin, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.action_applied",
      entity: "ops_agent_actions",
      entityId: actionId,
      after: { kind: row.kind, ref },
    });

    revalidatePath("/admin/agent");
    return actionOk({ ref });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed.";
    await admin
      .from("ops_agent_actions")
      .update({ status: "failed", error: message })
      .eq("id", actionId);
    revalidatePath("/admin/agent");
    return actionError(error);
  }
}

/** Saves the cadence/enablement settings for scheduled runs. */
export async function saveAgentSettingsAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const parsed = opsAgentSettingsSchema.safeParse({
    isEnabled: formData.get("isEnabled") === "on",
    proposalsEnabled: formData.get("proposalsEnabled") === "on",
    reportIntervalHours: formData.get("reportIntervalHours") || 24,
    backupIntervalHours: formData.get("backupIntervalHours") || 168,
  });
  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("ops_agent_settings")
    .update({
      is_enabled: parsed.data.isEnabled,
      proposals_enabled: parsed.data.proposalsEnabled,
      report_interval_hours: parsed.data.reportIntervalHours,
      backup_interval_hours: parsed.data.backupIntervalHours,
      updated_by: session.actorId,
    })
    .eq("id", true);
  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ops_agent.settings_updated",
    entity: "ops_agent_settings",
    entityId: "true",
    after: parsed.data,
  });

  revalidatePath("/admin/agent");
  return actionOk();
}

/**
 * Re-indexes the repository's own skill documents (skills.md, AGENTS.md). The
 * text arrives pre-bundled — Workers have no filesystem — and is chunked here so
 * later retrieval only pulls the few lines a question needs.
 */
export async function syncRepoSkillsAction(): Promise<
  FormActionResult<{ results: { name: string; chunks: number; ok: boolean }[] }>
> {
  const session = await assertCapability("ai.manage");

  try {
    const results = await syncSkillSources(
      REPO_SKILL_SOURCES.map((source) => ({
        name: source.name,
        source: source.source,
        text: source.text,
      })),
    );

    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.skills_synced",
      entity: "agent_skills",
      after: { results },
    });

    revalidatePath("/admin/agent");
    return actionOk({ results });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Imports skills from pasted GitHub URLs. Only GitHub hosts are accepted (see
 * `skill-sources`), and each source reports back individually so a bad URL is
 * visible rather than silently skipped.
 */
export async function importGithubSkillsAction(
  formData: FormData,
): Promise<
  FormActionResult<{
    results: { input: string; name: string | null; chunks: number; ok: boolean }[];
  }>
> {
  const session = await assertCapability("ai.manage");

  const parsed = skillImportSchema.safeParse({ urls: String(formData.get("urls") ?? "") });
  if (!parsed.success) return toFormError(parsed.error);

  try {
    const results = await importGithubSkills(parsed.data.urls);
    const ok = results.filter((r) => r.ok).length;

    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.skills_imported",
      entity: "agent_skills",
      after: { imported: ok, total: results.length },
    });

    revalidatePath("/admin/agent");
    return actionOk({ results });
  } catch (error) {
    return actionError(error);
  }
}

/** Stores an owner preference or note as retrievable memory. */
export async function rememberOwnerNoteAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return actionFail("VALIDATION", "A memory cannot be empty.");
  if (content.length > 2000) return actionFail("VALIDATION", "That memory is too long.");

  await remember({
    scope: "owner",
    kind: "owner_note",
    content,
    metadata: { actorId: session.actorId },
  });

  revalidatePath("/admin/agent");
  return actionOk();
}

/**
 * Points the scheduler at a base URL. This is an operator action rather than a
 * migration, because a migration cannot know the deployment's origin, and the
 * URL may legitimately be a preview host.
 *
 * The URL is validated to https and normalised before it is stored; the function
 * it calls reads the bearer token from Vault itself, so no secret is ever placed
 * in `cron.job` or on the wire by this action.
 */
export async function scheduleAgentCronAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await assertCapability("ai.manage");

  const raw = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(raw)) {
    return actionFail("VALIDATION", "Enter an https base URL, e.g. https://panda-wok.pages.dev");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return actionFail("NOT_CONFIGURED", "Privileged storage is unavailable.");

  const { error } = await admin.rpc("schedule_agent_cron", { p_base_url: raw });
  if (error) return actionError(error);

  await logAudit(admin, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ops_agent.cron_scheduled",
    entity: "cron",
    after: { baseUrl: raw },
  });

  revalidatePath("/admin/agent");
  return actionOk();
}

/* ------------------------------------------------------ team document library */

/** Adds a comment to a generated document. Owner/admin only (`ai.manage`). */
export async function commentOnArtifactAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("ai.manage");

  const artifactId = String(formData.get("artifactId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!artifactId) return actionFail("VALIDATION", "Missing document.");
  if (!body) return actionFail("VALIDATION", "Write a comment first.");
  if (body.length > 4000) return actionFail("VALIDATION", "That comment is too long.");

  const id = await addArtifactComment({
    artifactId,
    body,
    authorId: session.actorId,
    authorLabel: session.profile?.full_name ?? session.role,
  });
  if (!id) return actionFail("NOT_FOUND", "That document no longer exists.");

  revalidatePath("/admin/agent");
  return actionOk({ id });
}

/** Marks a document as reused, so the library can surface what the team reuses. */
export async function reuseArtifactAction(
  formData: FormData,
): Promise<FormActionResult<{ count: number }>> {
  const session = await assertCapability("ai.manage");

  const artifactId = String(formData.get("artifactId") ?? "").trim();
  if (!artifactId) return actionFail("VALIDATION", "Missing document.");

  try {
    const count = await markArtifactReused(artifactId);
    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.artifact_reused",
      entity: "agent_artifacts",
      entityId: artifactId,
      after: { count },
    });
    revalidatePath("/admin/agent");
    return actionOk({ count });
  } catch (error) {
    return actionError(error);
  }
}

/** Removes one stored memory. */
export async function deleteMemoryAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await assertCapability("ai.manage");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return actionFail("VALIDATION", "Missing memory.");
  const ok = await deleteAgentMemory(id);
  if (!ok) return actionFail("NOT_FOUND", "That memory no longer exists.");

  const supabase = await createServerSupabase();
  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: "ops_agent.memory_deleted",
    entity: "agent_memory",
    entityId: id,
  });
  revalidatePath("/admin/agent");
  return actionOk({ id });
}

/**
 * Re-embeds memories written while no embedding service was reachable, so they
 * become vector-searchable instead of stored-but-unreadable.
 */
export async function backfillMemoryAction(): Promise<FormActionResult<{ updated: number }>> {
  const session = await assertCapability("ai.manage");
  try {
    const updated = await backfillMemoryEmbeddings();
    const supabase = await createServerSupabase();
    await logAudit(supabase, {
      actorId: session.actorId,
      actorRole: session.role,
      action: "ops_agent.memory_backfilled",
      entity: "agent_memory",
      after: { updated },
    });
    revalidatePath("/admin/agent");
    return actionOk({ updated });
  } catch (error) {
    return actionError(error);
  }
}
