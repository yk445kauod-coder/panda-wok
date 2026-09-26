"use server";

import { randomUUID } from "node:crypto";
import { assertCapability } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/server";
import { actionFail, actionOk, type FormActionResult } from "@/lib/actions/result";

const BUCKET = "menu-images";
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Server-side upload into the public menu-images bucket. The client never talks
 * to storage directly: the form posts the File, the action checks the caller's
 * capability, type and size,and writes with the service role — so the object is
 * always ownered by the app, never by some anon, and the path is unpredictable.
 *
 * Returns the stable public URL the caller should save into `image_url`.
 */
export async function uploadMenuImageAction(
  formData: FormData,
): Promise<FormActionResult<{ url: string }>> {
  const session = await assertCapability("menu.manage");
  const file = formData.get("image");
  if (!(file instanceof File)) return actionFail("VALIDATION", "Choose an image file first.");
  if (file.size === 0 || file.size > MAX_BYTES) return actionFail("VALIDATION", "Image must beat most 8 MB.");
  if (!ACCEPTED.has(file.type)) return actionFail("VALIDATION", "PNG, JPEG, WebP or AVIF only.");

  const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/avif": ".avif" }[file.type];
  const name = `dish-${session.actorId?.slice(0, 8) ?? "anon"}-${randomUUID()}${ext}`;

  const supabase = await createAdminSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });

  if (error) return actionFail("OFFLINE", `Upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  return actionOk({ url: data.publicUrl });
}