"use server";

import { randomUUID } from "node:crypto";
import { assertCapability } from "@/lib/auth/session";
import { actionFail, actionOk, type FormActionResult } from "@/lib/actions/result";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Host of the `panda-wok-media` Worker, which serves every dish photo. Uploads
 * go to DBByte object storage; the browser always reads them back through this
 * one origin, so `image_url` is a stable URL that survives a change of store.
 */
const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? "https://panda-wok-media.yk445kauod.workers.dev"
).replace(/\/+$/, "");

/** DBByte REST gateway and the one bucket dish photos live in. */
const DBBYTE_ENDPOINT = (process.env.DBBYTE_ENDPOINT ?? "https://api.dbbyte.com").replace(/\/+$/, "");
const DBBYTE_BUCKET = process.env.DBBYTE_BUCKET ?? "panda-wok-media";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

/**
 * Server-side upload of a dish photo into DBByte object storage.
 *
 * The client never talks to storage directly: the form posts the File, the
 * action checks the caller's capability, type and size, and writes with the
 * server-held key — so the object is always owned by the app, the key never
 * reaches the browser, and the name is unpredictable. The stored name is
 * content-addressed (a fresh UUID per upload), which is what lets the media
 * worker cache each photo for a year: a replacement is a new URL, so no cache
 * anywhere — edge, CDN or browser — can serve the previous image.
 *
 * Returns the media-worker URL the caller saves into `image_url`.
 */
export async function uploadMenuImageAction(
  formData: FormData,
): Promise<FormActionResult<{ url: string }>> {
  const session = await assertCapability("menu.manage");
  const file = formData.get("image");
  if (!(file instanceof File)) return actionFail("VALIDATION", "Choose an image file first.");
  if (file.size === 0 || file.size > MAX_BYTES) return actionFail("VALIDATION", "Image must be at most 8 MB.");
  const ext = EXT[file.type];
  if (!ext) return actionFail("VALIDATION", "PNG, JPEG, WebP or AVIF only.");

  const key = process.env.DBBYTE_KEY;
  if (!key) {
    // A missing key is a deployment fault, not a user error. Say so plainly
    // rather than pretending the upload succeeded.
    return actionFail("OFFLINE", "Photo storage is not configured.");
  }

  const name = `dish-${session.actorId?.slice(0, 8) ?? "anon"}-${randomUUID()}${ext}`;

  const body = new FormData();
  body.append("file", file, name);

  let response: Response;
  try {
    response = await fetch(`${DBBYTE_ENDPOINT}/storage/${DBBYTE_BUCKET}/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body,
    });
  } catch {
    return actionFail("OFFLINE", "Upload failed: could not reach photo storage.");
  }

  if (!response.ok) {
    return actionFail("OFFLINE", `Upload failed (${response.status}).`);
  }

  // Served by the media worker, which reads the same bucket — a dish photo is
  // immutable, so the URL never changes and can be cached for a year.
  return actionOk({ url: `${MEDIA_ORIGIN}/media/${name}` });
}
