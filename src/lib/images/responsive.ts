/**
 * Responsive sizing for remote dish and hero images.
 *
 * The site renders art from remote URLs with Next's image optimizer disabled
 * (`images.unoptimized`), so the browser gets the raw URL. Two hosts support
 * server-driven resizing, so we rewrite their params to emit a `srcSet` that
 * matches the element's `sizes` — cards get a ~480px WebP, the detail page
 * ~800px, the hero up to 1600px — instead of always downloading the original:
 *
 * - Unsplash (dish photography) via `w`/`q`/`fm`.
 * - ImageKit (the owner's uploads, e.g. `brand.hero_url`) via `tr`.
 *
 * A **Supabase Storage** URL — the owner's own uploads in `menu-images` — is
 * served by the dedicated `panda-wok-media` Worker instead of `*.supabase.co`.
 * Those objects are the originals (a PNG averages ~775 KB), and Storage egress
 * is the project's scarce resource: live measurement showed 1.17 GB in a day,
 * which exhausted the Free plan's cached-egress quota and 402'd the whole API.
 * The media worker fetches each object once and serves it from Cloudflare's
 * cache thereafter, so the browser still gets the same bytes but Supabase is
 * asked once per object, not once per visitor.
 *
 * It is a *separate* Worker from the site's Pages/OpenNext worker on purpose: a
 * menu page with 48 photos then costs the site worker nothing for the images,
 * instead of running the whole Next pipeline (and its 10 ms Free-plan CPU
 * budget) just to hand back a byte stream.
 *
 * Any other host passes through untouched.
 */

const UNSPLASH_RE = /^https:\/\/images\.unsplash\.com\//;
const IMAGEKIT_RE = /^https:\/\/ik\.imagekit\.io\//;

/**
 * Host of the `panda-wok-media` Worker. Overridable per environment so a preview
 * or a self-hosted deploy can point elsewhere; the default is the deployed one.
 */
const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? "https://panda-wok-media.yk445kauod.workers.dev"
).replace(/\/+$/, "");

/**
 * A Supabase Storage public-object URL: `https://<ref>.supabase.co/storage/v1/
 * object/public/<bucket>/<name>`. Captures bucket and name so the media URL can
 * be rebuilt; the bucket is validated again on the worker side.
 */
const SUPABASE_STORAGE_RE =
  /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i;

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

/** The media-worker URL for a Supabase Storage object, or null. */
function proxiedMediaUrl(url: string): string | null {
  const match = url.match(SUPABASE_STORAGE_RE);
  if (!match) return null;
  const [, bucket, name] = match;
  if (bucket !== "menu-images") return null;
  return `${MEDIA_ORIGIN}/media/${name}`;
}

/** Unsplash URL at a given pixel width, serving WebP and quality 70. */
export function dishImageSrc(url: string, width: number): string {
  const media = proxiedMediaUrl(url);
  if (media) return media;
  if (IMAGEKIT_RE.test(url)) return imagekitSrc(url, width);
  if (!UNSPLASH_RE.test(url)) return url;
  return `${stripQuery(url)}?w=${width}&q=70&fm=webp`;
}

/**
 * ImageKit URL with an explicit `tr` transform, returning WebP at `width`.
 *
 * ImageKit is the host the owner uploads to, so the hero photo is routinely
 * 200-300 KB at full size — far too much for a background that paints behind
 * every other element. `?tr=w-1600,q-70,f-webp` is what ImageKit's own CDN
 * honours; the untransformed URL is still served when the transform is absent.
 *
 * `c-at_max` means "do not enlarge": asking for `w-1600` from a 941px original
 * otherwise returns an upscaled 1600x2843 (191 KB) instead of the sharp
 * 941x1672 (109 KB). Verified against the live CDN.
 *
 * The base path is kept verbatim, including its percent-encoding, because the
 * asset name itself contains a space (`...%20(1).png`).
 */
export function imagekitSrc(url: string, width: number): string {
  if (!IMAGEKIT_RE.test(url)) return url;
  const [base, query] = url.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set("tr", `w-${width},q-70,f-webp,c-at_max`);
  return `${base}?${params.toString()}`;
}

const DEFAULT_WIDTHS = [400, 640, 800, 1200];

/**
 * `srcSet` for the given widths, derived from a single base URL.
 */
export function dishImageSrcSet(
  url: string,
  widths: readonly number[] = DEFAULT_WIDTHS,
): string {
  // The proxy serves the object as stored — one file, one cached copy — so a
  // `srcSet` of widths would just repeat the same URL. Emit the single proxied
  // path and let `sizes` describe the layout.
  const media = proxiedMediaUrl(url);
  if (media) return media;
  if (IMAGEKIT_RE.test(url)) {
    return widths.map((w) => `${imagekitSrc(url, w)} ${w}w`).join(", ");
  }
  if (!UNSPLASH_RE.test(url)) return url;
  return widths.map((w) => `${dishImageSrc(url, w)} ${w}w`).join(", ");
}