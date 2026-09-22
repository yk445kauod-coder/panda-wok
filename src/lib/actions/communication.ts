"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  conversationCreateSchema,
  feedbackSchema,
  messageSchema,
} from "@/lib/validation/schemas";
import {
  actionError,
  actionOk,
  toFormError,
  type FormActionResult,
} from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";

export async function submitFeedbackAction(
  formData: FormData,
): Promise<FormActionResult<{ id: string }>> {
  const session = await requireUser("/feedback");

  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  const parsed = feedbackSchema.safeParse({
    orderId: formData.get("orderId") || undefined,
    rating: formData.get("rating"),
    category: formData.get("category") || "overall",
    title: formData.get("title") ?? undefined,
    message: formData.get("message"),
    imageUrls,
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const v = parsed.data;

  // If an order is referenced it must belong to the caller: RLS does not
  // protect against a user attaching feedback to someone else's order.
  if (v.orderId) {
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("id", v.orderId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!order) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "That order is not on your account." },
      };
    }
  }

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      user_id: session.user.id,
      order_id: v.orderId ?? null,
      rating: v.rating,
      category: v.category,
      title: v.title ?? null,
      message: v.message,
      image_urls: v.imageUrls,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(error ?? new Error("Feedback not saved"));

  await logActivity(supabase, {
    userId: session.user.id,
    event: "FEEDBACK_SUBMITTED",
    entity: "feedback",
    entityId: data.id,
    metadata: { rating: v.rating, category: v.category },
  });

  revalidatePath("/feedback");
  revalidatePath("/account");
  return actionOk({ id: data.id });
}

export async function createConversationAction(
  formData: FormData,
): Promise<FormActionResult<{ conversationId: string }>> {
  const session = await requireUser("/chat");

  const parsed = conversationCreateSchema.safeParse({
    subject: formData.get("subject"),
    message: formData.get("message"),
    orderId: formData.get("orderId") || undefined,
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const v = parsed.data;

  if (v.orderId) {
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("id", v.orderId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!order) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "That order is not on your account." },
      };
    }
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      user_id: session.user.id,
      subject: v.subject,
      related_order_id: v.orderId ?? null,
    })
    .select("id")
    .single();

  if (error || !conversation) {
    return actionError(error ?? new Error("Conversation not created"));
  }

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: session.user.id,
    sender_kind: "customer",
    body: v.message,
  });

  if (messageError) return actionError(messageError);

  await logActivity(supabase, {
    userId: session.user.id,
    event: "MESSAGE_SENT",
    entity: "conversations",
    entityId: conversation.id,
  });

  revalidatePath("/chat");
  return actionOk({ conversationId: conversation.id });
}

export async function sendMessageAction(
  formData: FormData,
): Promise<FormActionResult<undefined>> {
  const session = await requireUser("/chat");

  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
    isInternalNote: formData.get("isInternalNote") === "on",
  });

  if (!parsed.success) return toFormError(parsed.error);

  const supabase = await createServerSupabase();
  const v = parsed.data;

  if (!v.conversationId) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "Pick a conversation first." },
    };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, user_id")
    .eq("id", v.conversationId)
    .maybeSingle();

  if (!conversation) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Conversation not found." } };
  }

  const isOwner = conversation.user_id === session.user.id;
  const isStaff = session.isStaff;

  if (!isOwner && !isStaff) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not your conversation." } };
  }

  // Internal notes are staff-only; the database enforces this too.
  if (v.isInternalNote && !isStaff) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Internal notes are staff-only." } };
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: v.conversationId,
    sender_id: session.user.id,
    sender_kind: isOwner ? "customer" : "staff",
    body: v.body,
    is_internal_note: v.isInternalNote,
  });

  if (error) return actionError(error);

  await logActivity(supabase, {
    userId: session.user.id,
    event: "MESSAGE_SENT",
    entity: "conversations",
    entityId: v.conversationId,
  });

  revalidatePath("/chat");
  revalidatePath(`/admin/chat/${v.conversationId}`);
  return actionOk();
}

export async function markConversationReadAction(
  conversationId: string,
): Promise<FormActionResult<undefined>> {
  const session = await requireUser("/chat");
  const supabase = await createServerSupabase();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Conversation not found." } };
  }

  const patch =
    conversation.user_id === session.user.id
      ? { customer_unread: 0 }
      : session.isStaff
        ? { staff_unread: 0 }
        : null;

  if (!patch) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not your conversation." } };
  }

  const { error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId);

  if (error) return actionError(error);
  return actionOk();
}
