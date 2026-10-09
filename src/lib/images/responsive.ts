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
 * Any other host passes through untouched.
 */

const UNSPLASH_RE = /^https:\/\/images\.unsplash\.com\//;
const IMAGEKIT_RE = /^https:\/\/ik\.imagekit\.io\//;

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

/** Unsplash URL at a given pixel width, serving WebP and quality 70. */
export function dishImageSrc(url: string, width: number): string {
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
  if (IMAGEKIT_RE.test(url)) {
    return widths.map((w) => `${imagekitSrc(url, w)} ${w}w`).join(", ");
  }
  if (!UNSPLASH_RE.test(url)) return url;
  return widths.map((w) => `${dishImageSrc(url, w)} ${w}w`).join(", ");
}