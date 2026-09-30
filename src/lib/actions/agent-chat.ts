"use server";

import { revalidatePath } from "next/cache";
import { assertCapability, getAdminSession } from "@/lib/auth/session";
import { capabilitiesFor } from "@/lib/auth/rbac";
import { actionError, actionOk, type FormActionResult } from "@/lib/actions/result";
import { runAgentTurn, type AgentStep } from "@/lib/agent/conversation";
import {
  appendAgentMessage,
  compactAgentHistory,
  createAgentThread,
  deleteAgentThread,
  titleThreadFromFirstMessage,
} from "@/lib/services/agent-chat";
import { captureTurnMemory } from "@/lib/agent/memory";
import { logAudit } from "@/lib/activity/log";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * The conversational agent, as a server action.
 *
 * Authorisation is the same gate every other admin action uses: the actor must
 * be unlocked and hold `ai.manage`. The tool set is then filtered by that
 * actor's capabilities inside the loop, so a support-only member cannot reach
 * the menu or discount tools even by asking for them by name.
 *
 * `confirmWrites` defaults to true. Passing false arms auto-apply for one turn;
 * the UI only does that behind an explicit toggle, never by default.
 */

export type AgentChatResult = {
  threadId: string;
  answer: string;
  steps: AgentStep[];
  provider: string;
  model: string;
  pendingApproval: AgentStep[];
};

export async function askAgentAction(formData: FormData): Promise<FormActionResult<AgentChatResult>> {
  try {
    const session = await assertCapability("ai.manage");
    const message = String(formData.get("message") ?? "").trim();
    if (!message) return { ok: false, error: { code: "VALIDATION", message: "Type a message first." } };

    const threadId = String(formData.get("threadId") ?? "").trim();
    const autoApply = formData.get("autoApply") === "true";

    const ownerId = session.actorId ?? null;
    const activeThread =
      threadId || (await createAgentThread({ ownerId, ownerLabel: session.profile?.full_name ?? null }));

    await appendAgentMessage({ threadId: activeThread, role: "user", body: message });
    await titleThreadFromFirstMessage(activeThread, message);

    // Short-term memory: the recent turns verbatim, older turns folded into a
    // rolling summary so a long session keeps its thread. Long-term memory is
    // written after the answer, from what the operator explicitly asked to keep.
    const { history } = await compactAgentHistory(activeThread);
    const result = await runAgentTurn({
      question: message,
      history,
      capabilities: capabilitiesFor(session.role),
      actorName: session.profile?.full_name ?? session.role,
      confirmWrites: !autoApply,
    });

    // Best-effort durable memory: never fail the answer over a memory write.
    const saved = await captureTurnMemory({
      question: message,
      answer: result.answer,
      actorId: ownerId,
    }).catch(() => 0);

    await appendAgentMessage({
      threadId: activeThread,
      role: "assistant",
      body: result.answer,
      steps: result.steps,
      provider: result.provider,
      model: result.model,
    });

    await logAudit(createAdminSupabase(), {
      actorId: session.actorId ?? null,
      actorRole: session.role,
      action: "agent.chat",
      entity: "agent_thread",
      entityId: activeThread,
      after: {
        tools: result.steps.map((s) => s.tool),
        pending: result.pendingApproval.length,
        provider: result.provider,
        memoriesSaved: saved,
      },
    });

    revalidatePath("/admin/agent/chat");
    return actionOk({
      threadId: activeThread,
      answer: result.answer,
      steps: result.steps,
      provider: result.provider,
      model: result.model,
      pendingApproval: result.pendingApproval,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteAgentThreadAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  try {
    const session = await assertCapability("ai.manage");
    const id = String(formData.get("threadId") ?? "").trim();
    if (!id) return { ok: false, error: { code: "VALIDATION", message: "Missing thread." } };
    await deleteAgentThread(id, session.actorId ?? null);
    revalidatePath("/admin/agent/chat");
    return actionOk({ id });
  } catch (error) {
    return actionError(error);
  }
}

/** Starts a fresh thread and returns its id so the UI can navigate to it. */
export async function startAgentThreadAction(): Promise<FormActionResult<{ threadId: string }>> {
  try {
    const session = await assertCapability("ai.manage");
    const id = await createAgentThread({
      ownerId: session.actorId ?? null,
      ownerLabel: session.profile?.full_name ?? null,
    });
    return actionOk({ threadId: id });
  } catch (error) {
    return actionError(error);
  }
}

/** Whether the current actor may arm auto-apply (owner/admin only). */
export async function agentAutoApplyAllowed(): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  return capabilitiesFor(session.role).includes("ai.manage") && session.role !== "support";
}
