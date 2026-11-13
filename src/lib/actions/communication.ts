"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { feedbackSchema } from "@/lib/validation/schemas";
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
