"use server";

import { randomUUID } from "node:crypto";
import { assertCapability } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCloudflareBindings } from "@/lib/d1/database";
import { actionFail, actionOk, type FormActionResult } from "@/lib/actions/result";

const BUCKET = "menu-images";
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Where uploaded dish photos live.
 *
 * Prefers the Cloudflare R2 binding (`MEDIA_BUCKET`): it is the deployment's own
 * storage, so an image costs no Supabase egress — the quota that 402'd the whole
 * project. It is read through `getCloudflareBindings()` rather than declared in
 * `wrangler.jsonc` alone because R2 must be enabled on the account and the
 * binding attached to the Pages project before it exists; until then this is
 * `undefined` and the Supabase path is used, so the code is correct either way.
 */
const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? "https://panda-wok-media.yk445kauod.workers.dev"
).replace(/\/+$/, "");

/**
 * Server-side upload into the menu-photo store. The client never talks to
 * storage directly: the form posts the File, the action checks the caller's
 * capability, type and size, and writes with the service role — so the object is
 * always owned by the app, never by some anon, and the path is unpredictable.
 *
 * Returns the stable public URL the caller should save into `image_url`.
 */
export async function uploadMenuImageAction(
  formData: FormData,
): Promise<FormActionResult<{ url: string }>> {
  const session = await assertCapability("menu.manage");
  const file = formData.get("image");
  if (!(file instanceof File)) return actionFail("VALIDATION", "Choose an image file first.");
  if (file.size === 0 || file.size > MAX_BYTES) return actionFail("VALIDATION", "Image must be at most 8 MB.");
  if (!ACCEPTED.has(file.type)) return actionFail("VALIDATION", "PNG, JPEG, WebP or AVIF only.");

  const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/avif": ".avif" }[file.type];
  const name = `dish-${session.actorId?.slice(0, 8) ?? "anon"}-${randomUUID()}${ext}`;

  const r2 = getCloudflareBindings().MEDIA_BUCKET;
  if (r2) {
    try {
      await r2.put(name, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      });
      // Served by the media worker, which reads this same bucket — a dish photo
      // is immutable, so the URL never changes and can be cached for a year.
      return actionOk({ url: `${MEDIA_ORIGIN}/media/${name}` });
    } catch (error) {
      return actionFail(
        "OFFLINE",
        `Upload failed: ${error instanceof Error ? error.message : "R2 write error"}`,
      );
    }
  }

  const supabase = await createAdminSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });

  if (error) return actionFail("OFFLINE", `Upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  return actionOk({ url: data.publicUrl });
}