"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tryCreateAdminSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";
import {
  actionOk,
  actionError,
  actionFail,
  fieldErrors,
  type FormActionResult,
} from "@/lib/actions/result";

/**
 * Team chat is staff-only and, unlike customer chat, the member arrives through
 * the ops gate rather than a Supabase auth session. The gate session carries a
 * real `actorId` (a staff member's auth user id), so writes are attributed and
 * membership is checked against that id — never against anything the client
 * sends.
 *
 * This mirrors `sendMessageAction`'s operator path: authorise by capability,
 * then write through the service role, because a gate session has no
 * `auth.uid()` for the RLS insert policy to match.
 */

const postSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a message first.").max(4000),
});

export async function sendTeamMessageAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const parsed = postSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid message." }, fields: fieldErrors(parsed.error) };
  }

  let ops;
  try {
    ops = await assertCapability("chat.manage");
  } catch {
    return actionFail("FORBIDDEN", "Unlock the ops console first.");
  }
  if (!ops.actorId) {
    return actionFail("UNKNOWN", "This ops session cannot be attributed to a staff member.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return actionFail("UNKNOWN", "Team chat needs the service-role key on the server.");

  // Membership is the authorisation, not the capability: a staff member must be
  // in the thread to post to it.
  const { data: member } = await admin
    .from("team_thread_members")
    .select("thread_id")
    .eq("thread_id", parsed.data.threadId)
    .eq("user_id", ops.actorId)
    .maybeSingle();

  if (!member) {
    return actionFail("FORBIDDEN", "You are not a member of that thread.");
  }

  const { error } = await admin.from("team_messages").insert({
    thread_id: parsed.data.threadId,
    sender_id: ops.actorId,
    body: parsed.data.body,
  });
  if (error) return actionError(error);

  await admin
    .from("team_thread_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", parsed.data.threadId)
    .eq("user_id", ops.actorId);

  // Tell the other members their thread moved. Bulk insert rather than the
  // single-row RPC, because a channel can have many recipients, and the
  // service-role client is already the only writer of `notifications`.
  const [{ data: others }, { data: thread }] = await Promise.all([
    admin
      .from("team_thread_members")
      .select("user_id")
      .eq("thread_id", parsed.data.threadId)
      .neq("user_id", ops.actorId),
    admin.from("team_threads").select("name").eq("id", parsed.data.threadId).maybeSingle(),
  ]);

  if (others && others.length > 0) {
    await admin.from("notifications").insert(
      others.map((member) => ({
        user_id: member.user_id,
        audience: "staff",
        category: "team",
        kind: "team_message",
        title: `New message in ${thread?.name ?? "team chat"}`,
        body: parsed.data.body.slice(0, 160),
        link: `/admin/team-chat/${parsed.data.threadId}`,
      })),
    );
  }

  revalidatePath("/admin/team-chat");
  revalidatePath(`/admin/team-chat/${parsed.data.threadId}`);
  return actionOk();
}

export async function openTeamDmAction(
  otherUserId: string,
): Promise<FormActionResult<{ threadId: string }>> {
  const parsed = z.string().uuid().safeParse(otherUserId);
  if (!parsed.success) return actionFail("VALIDATION", "Pick a team member.");

  try {
    await assertCapability("chat.manage");
  } catch {
    return actionFail("FORBIDDEN", "Unlock the ops console first.");
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return actionFail("UNKNOWN", "Team chat needs the service-role key on the server.");

  const ops = await assertCapability("chat.manage");
  if (!ops.actorId) return actionFail("UNKNOWN", "This ops session has no staff identity.");

  // The RPC uses auth.uid(), which a gate session lacks, so the pair is
  // resolved here through the service role with an explicit membership check.
  const me = ops.actorId;
  if (parsed.data === me) return actionFail("VALIDATION", "You cannot message yourself.");

  const { data: rows } = await admin
    .from("team_thread_members")
    .select("thread_id, user_id")
    .in("user_id", [me, parsed.data]);

  const byThread = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const set = byThread.get(row.thread_id) ?? new Set<string>();
    set.add(row.user_id);
    byThread.set(row.thread_id, set);
  }
  const existing = [...byThread.entries()].find(
    ([, members]) => members.size === 2 && members.has(me) && members.has(parsed.data),
  );
  if (existing) return actionOk({ threadId: existing[0] });

  const { data: otherStaff } = await admin
    .from("staff")
    .select("user_id")
    .eq("user_id", parsed.data)
    .eq("is_active", true)
    .maybeSingle();
  if (!otherStaff) return actionFail("VALIDATION", "That is not an active team member.");

  const slug = `dm:${[me, parsed.data].sort().join(":")}`;
  const { data: thread, error } = await admin
    .from("team_threads")
    .insert({ kind: "dm", name: "Direct message", slug, created_by: me })
    .select("id")
    .single();
  if (error || !thread) return actionError(error ?? new Error("Thread not created"));

  await admin
    .from("team_thread_members")
    .insert([
      { thread_id: thread.id, user_id: me },
      { thread_id: thread.id, user_id: parsed.data },
    ]);

  revalidatePath("/admin/team-chat");
  return actionOk({ threadId: thread.id });
}

export async function markTeamThreadReadAction(
  threadId: string,
): Promise<FormActionResult<undefined>> {
  const parsed = z.string().uuid().safeParse(threadId);
  if (!parsed.success) return actionFail("VALIDATION", "Unknown thread.");

  try {
    await assertCapability("chat.manage");
  } catch {
    return actionFail("FORBIDDEN", "Unlock the ops console first.");
  }
  const ops = await assertCapability("chat.manage");
  if (!ops.actorId) return actionFail("UNKNOWN", "No staff identity on this session.");

  const admin = tryCreateAdminSupabase();
  if (!admin) return actionFail("UNKNOWN", "Team chat needs the service-role key on the server.");

  await admin
    .from("team_thread_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", parsed.data)
    .eq("user_id", ops.actorId);

  revalidatePath("/admin/team-chat");
  return actionOk();
}
