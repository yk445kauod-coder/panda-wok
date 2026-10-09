"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCapability } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/server";
import { actionError, actionOk, type FormActionResult } from "@/lib/actions/result";
import { probeMcpServer, type McpServerRow } from "@/lib/agent/mcp";
import { getMcpServer } from "@/lib/services/agent-ops";
import { getMcpPreset } from "@/lib/agent/mcp-presets";
import { logAudit } from "@/lib/activity/log";

/**
 * MCP server + automation management. Both are owner/admin surfaces (they grant
 * the agent new reach), so every action asserts `ai.manage` before touching the
 * database, exactly like the AI-centre actions.
 */

const mcpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lower-case letters, digits and dashes."),
  url: z.string().trim().url(),
  transport: z.enum(["http", "sse"]).default("http"),
  authHeader: z.string().trim().max(60).optional(),
  secretRef: z.string().trim().max(120).optional(),
  allowedTools: z.string().trim().optional(),
  isEnabled: z.coerce.boolean().default(true),
});

export async function saveMcpServerAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  try {
    await assertCapability("ai.manage");
    const parsed = mcpSchema.safeParse({
      name: formData.get("name"),
      url: formData.get("url"),
      transport: formData.get("transport") ?? "http",
      authHeader: formData.get("authHeader") ?? undefined,
      secretRef: formData.get("secretRef") ?? undefined,
      allowedTools: formData.get("allowedTools") ?? undefined,
      isEnabled: formData.get("isEnabled") === "on" || formData.get("isEnabled") === "true",
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      };
    }
    const input = parsed.data;
    const admin = createAdminSupabase();
    const id = String(formData.get("id") ?? "").trim();

    const row = {
      name: input.name,
      url: input.url,
      transport: input.transport,
      auth_header: input.authHeader || "authorization",
      secret_ref: input.secretRef || null,
      allowed_tools: input.allowedTools
        ? input.allowedTools
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
      is_enabled: input.isEnabled,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { error } = await admin.from("mcp_servers").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("mcp_servers").insert(row);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/admin/agent/mcp");
    return actionOk({ id: id || input.name });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteMcpServerAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  try {
    await assertCapability("ai.manage");
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: { code: "VALIDATION", message: "Missing server id." } };
    const admin = createAdminSupabase();
    const { error } = await admin.from("mcp_servers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/agent/mcp");
    return actionOk({ id });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Installs a ready-to-configure connector from a preset.
 *
 * The endpoint and secret *name* come from the preset, not the form, so a
 * tampered request cannot point a known vendor name at an arbitrary URL. The
 * credential value is optional here: the connector is stored disabled until a
 * human pastes the token, so an accidental "add" cannot give the agent a live
 * connection to an account with no auth.
 */
export async function installMcpPresetAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string; needsSecret: boolean }>> {
  try {
    await assertCapability("ai.manage");
    const preset = getMcpPreset(String(formData.get("preset") ?? "").trim());
    if (!preset) {
      return { ok: false, error: { code: "VALIDATION", message: "Unknown connector." } };
    }

    const admin = createAdminSupabase();
    const { data: existing } = await admin
      .from("mcp_servers")
      .select("id")
      .eq("name", preset.id)
      .maybeSingle();
    if (existing) {
      return { ok: false, error: { code: "VALIDATION", message: `${preset.name} is already added.` } };
    }

    const { data, error } = await admin
      .from("mcp_servers")
      .insert({
        name: preset.id,
        url: preset.url,
        transport: preset.transport,
        auth_header: preset.authHeader,
        secret_ref: preset.secretRef,
        allowed_tools: null,
        // Disabled until a credential is saved — see the note above.
        is_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAudit(admin, {
      actorId: null,
      actorRole: "owner",
      action: "mcp_server.preset_installed",
      entity: "mcp_servers",
      entityId: (data as { id: string }).id,
      after: { preset: preset.id, secretRef: preset.secretRef },
    });

    revalidatePath("/admin/agent/mcp");
    return actionOk({ id: (data as { id: string }).id, needsSecret: true });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Saves the credential for an MCP connector into Vault under the name the
 * server row already references. The value never comes back out — the row keeps
 * only the secret *name*, and the agent resolves it server-side at call time.
 */
export async function saveMcpSecretAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  try {
    await assertCapability("ai.manage");
    const id = String(formData.get("id") ?? "").trim();
    const value = String(formData.get("value") ?? "").trim();
    const server = await getMcpServer(id);
    if (!server) return { ok: false, error: { code: "NOT_FOUND", message: "No such server." } };
    if (!server.secret_ref) {
      return { ok: false, error: { code: "VALIDATION", message: "This connector has no secret name." } };
    }
    if (value.length < 8) {
      return { ok: false, error: { code: "VALIDATION", message: "The value looks too short — paste the full token." } };
    }

    const admin = createAdminSupabase();
    const { error } = await admin.rpc("set_ai_secret", {
      p_name: server.secret_ref,
      p_value: value,
      p_description: `MCP connector: ${server.name}`,
    });
    if (error) throw new Error(error.message);

    // Storing a credential means the connector is ready; enable it so the agent
    // can reach it, and note that act in the audit trail.
    const { error: enableError } = await admin
      .from("mcp_servers")
      .update({ is_enabled: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (enableError) throw new Error(enableError.message);

    await logAudit(admin, {
      actorId: null,
      actorRole: "owner",
      action: "mcp_server.secret_saved",
      entity: "mcp_servers",
      entityId: id,
      after: { secretRef: server.secret_ref, enabled: true },
    });

    revalidatePath("/admin/agent/mcp");
    return actionOk();
  } catch (error) {
    return actionError(error);
  }
}

/** Probes a server and reports how many tools it advertises. */
export async function probeMcpServerAction(
  formData: FormData,
): Promise<FormActionResult<{ ok: boolean; toolCount: number; error: string | null }>> {
  try {
    await assertCapability("ai.manage");
    const id = String(formData.get("id") ?? "").trim();
    const server = await getMcpServer(id);
    if (!server) return { ok: false, error: { code: "NOT_FOUND", message: "No such server." } };
    const result = await probeMcpServer(server as McpServerRow);
    revalidatePath("/admin/agent/mcp");
    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

const automationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["report", "agent", "export"]),
  prompt: z.string().trim().max(4000).optional(),
  cadence: z.enum(["daily", "weekly", "monthly", "interval"]),
  intervalHours: z.coerce.number().int().min(1).max(720).optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  atHour: z.coerce.number().int().min(0).max(23),
  isEnabled: z.coerce.boolean().default(true),
  notify: z.coerce.boolean().default(true),
});

export async function saveAutomationAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  try {
    await assertCapability("ai.manage");
    const parsed = automationSchema.safeParse({
      name: formData.get("name"),
      kind: formData.get("kind") ?? "report",
      prompt: formData.get("prompt") ?? undefined,
      cadence: formData.get("cadence") ?? "daily",
      intervalHours: formData.get("intervalHours") || undefined,
      weekday: formData.get("weekday") ?? undefined,
      dayOfMonth: formData.get("dayOfMonth") || undefined,
      atHour: formData.get("atHour") ?? 8,
      isEnabled: formData.get("isEnabled") === "on" || formData.get("isEnabled") === "true",
      notify: formData.get("notify") === "on" || formData.get("notify") === "true",
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      };
    }
    const input = parsed.data;
    const admin = createAdminSupabase();
    const id = String(formData.get("id") ?? "").trim();
    const row = {
      name: input.name,
      kind: input.kind,
      prompt: input.prompt || null,
      cadence: input.cadence,
      interval_hours: input.cadence === "interval" ? (input.intervalHours ?? 24) : null,
      weekday: input.cadence === "weekly" ? (input.weekday ?? 1) : null,
      day_of_month: input.cadence === "monthly" ? (input.dayOfMonth ?? 1) : null,
      at_hour: input.atHour,
      is_enabled: input.isEnabled,
      notify: input.notify,
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { error } = await admin.from("agent_automations").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("agent_automations").insert(row);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/admin/agent/automations");
    return actionOk({ id: id || input.name });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteAutomationAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  try {
    await assertCapability("ai.manage");
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: { code: "VALIDATION", message: "Missing automation id." } };
    const admin = createAdminSupabase();
    const { error } = await admin.from("agent_automations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/agent/automations");
    return actionOk({ id });
  } catch (error) {
    return actionError(error);
  }
}
