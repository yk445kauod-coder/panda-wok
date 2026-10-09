"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/auth/session";
import { logAudit } from "@/lib/activity/log";
import { actionError, actionFail, actionOk, type FormActionResult } from "@/lib/actions/result";

/**
 * The manual close/open lever, as a single-purpose action.
 *
 * The settings form saves all four ordering keys at once, which is right for the
 * hours editor but wrong for an emergency switch: a lever that writes
 * `open_time` back from a stale page could silently rewind a window the owner
 * changed on another device. This action touches **only**
 * `ordering.accepting_orders`.
 *
 * The write goes through the normal capability-gated client rather than the
 * service role, so RLS stays the authority on who may flip it.
 */
export async function setAcceptingOrdersAction(
  formData: FormData,
): Promise<FormActionResult<{ accepting: boolean }>> {
  const session = await assertCapability("settings.manage");

  const raw = formData.get("accepting");
  if (raw !== "true" && raw !== "false") {
    return actionFail("VALIDATION", "The lever must be either open or closed.");
  }
  const accepting = raw === "true";

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("settings")
    .update({ value: accepting as never, updated_by: session.actorId })
    .eq("key", "ordering.accepting_orders");

  if (error) return actionError(error);

  await logAudit(supabase, {
    actorId: session.actorId,
    actorRole: session.role,
    action: accepting ? "ordering.opened" : "ordering.closed",
    entity: "settings",
    entityId: null,
    after: { key: "ordering.accepting_orders", value: accepting },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return actionOk({ accepting });
}
