"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCapability } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/server";
import { actionError, actionOk, type FormActionResult } from "@/lib/actions/result";
import { probeMcpServer, type McpServerRow } from "@/lib/agent/mcp";
import { getMcpServer } from "@/lib/services/agent-ops";

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
