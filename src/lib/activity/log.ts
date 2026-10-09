import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database";

export type ActivityEvent =
  | "LOGIN"
  | "LOGOUT"
  | "SIGNUP"
  | "MENU_VIEW"
  | "ITEM_VIEW"
  | "CART_ADD"
  | "CART_REMOVE"
  | "CHECKOUT_STARTED"
  | "ORDER_CREATED"
  | "ORDER_CANCELED"
  | "FEEDBACK_SUBMITTED"
  | "LOYALTY_REWARD_EARNED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "ADDRESS_SAVED"
  | "PROFILE_UPDATED"
  | "ASSISTANT_USED"
  | "REWARD_REDEEMED";

/**
 * Writes a single structured activity row. Failures are swallowed on purpose:
 * analytics must never break a real customer flow such as checkout.
 */
export async function logActivity(
  supabase: SupabaseClient<Database>,
  params: {
    userId?: string | null;
    event: ActivityEvent;
    entity?: string;
    entityId?: string;
    metadata?: Json;
    sessionId?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("activity_logs").insert({
      user_id: params.userId ?? null,
      event: params.event,
      entity: params.entity ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
      session_id: params.sessionId ?? null,
    });
  } catch {
    // Intentionally ignored: activity logging is best effort.
  }
}

/** Staff audit trail. Unlike activity logs these are not best-effort silent. */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  params: {
    actorId: string | null;
    actorRole: Database["public"]["Enums"]["staff_role"] | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: Json | null;
    after?: Json | null;
  },
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
    });
  } catch {
    // Best effort: never block an admin operation because auditing failed.
  }
}
