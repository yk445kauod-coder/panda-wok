"use server";

import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
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

/** DBByte S3 endpoint and the one bucket dish photos live in. */
const DBBYTE_ENDPOINT = (process.env.DBBYTE_ENDPOINT ?? "https://s3.dbbyte.com").replace(/\/+$/, "");
const DBBYTE_BUCKET = process.env.DBBYTE_BUCKET ?? "panda-wok-media";
/** `dbs_...` access key id. An identifier, not the secret half of the pair. */
const DBBYTE_ACCESS_KEY_ID = process.env.DBBYTE_ACCESS_KEY_ID ?? "dbs_f5595e9219c54ff1f9bc473c";
/**
 * DBByte's public CDN token, copied from the bucket's page in the dashboard.
 *
 * The bucket is public, so a file has a permanent, key-free URL of the form
 * `https://cdn.dbbyte.com/<token>/<bucket>/<file>`. When this is set, uploads
 * return that URL and **no Worker is involved in serving a dish photo at all**
 * — the CDN answers, which costs the site's 10 ms CPU budget nothing. It is a
 * non-secret value (it appears in every image URL) and is read at request time,
 * so it can be set without a rebuild.
 */
const DBBYTE_CDN_TOKEN = (process.env.DBBYTE_CDN_TOKEN ?? "").replace(/^\/+|\/+$/g, "");
/** DBByte's S3 signature region. Fixed by the provider. */
const DBBYTE_REGION = "us-east-1";

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

  const accessKeyId = DBBYTE_ACCESS_KEY_ID;
  // `DBBYTE_KEY` is the legacy name from the REST-gateway era; it is the same
  // value that signs S3, so an environment still carrying it keeps working
  // across the switch instead of reporting "not configured".
  const secretAccessKey = process.env.DBBYTE_SECRET_ACCESS_KEY ?? process.env.DBBYTE_KEY;
  if (!secretAccessKey) {
    // A missing key is a deployment fault, not a user error. Say so plainly
    // rather than pretending the upload succeeded.
    return actionFail("OFFLINE", "Photo storage is not configured.");
  }

  const name = `dish-${session.actorId?.slice(0, 8) ?? "anon"}-${randomUUID()}${ext}`;

  // DBByte speaks the S3 protocol: a PUT of the bytes to
  // `<endpoint>/<bucket>/<name>`, SigV4-signed. The key stays on the server.
  const s3 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: DBBYTE_REGION,
  });

  let response: Response;
  try {
    response = await s3.fetch(
      `${DBBYTE_ENDPOINT}/${encodeURIComponent(DBBYTE_BUCKET)}/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        body: await file.arrayBuffer(),
        headers: { "content-type": file.type },
      },
    );
  } catch {
    return actionFail("OFFLINE", "Upload failed: could not reach photo storage.");
  }

  if (!response.ok) {
    return actionFail("OFFLINE", `Upload failed (${response.status}).`);
  }

  // Public bucket + CDN token: the file has a permanent, key-free URL served by
  // DBByte's edge, so no Worker sits in the image path at all. Without the token
  // fall back to the media Worker, which signs the read server-side.
  const url = DBBYTE_CDN_TOKEN
    ? `https://cdn.dbbyte.com/${DBBYTE_CDN_TOKEN}/${DBBYTE_BUCKET}/${encodeURIComponent(name)}`
    : `${MEDIA_ORIGIN}/media/${name}`;
  return actionOk({ url });
}
