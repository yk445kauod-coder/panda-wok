/**
 * Responsive sizing for remote dish images.
 *
 * The site renders dish art from remote URLs (today Unsplash) with Next's
 * image optimizer disabled (`images.unoptimized`), so the browser gets the
 * raw URL. Unsplash supports server-driven resizing, so we rewrite its query
 * params to emit a `srcSet` that matches the element's `sizes` — cards get a
 * ~480px WebP, the detail page ~800px — instead of always downloading the
 * original. Non-Unsplash URLs pass through untouched.
 */

const UNSPLASH_RE = /^https:\/\/images\.unsplash\.com\//;

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

/** Unsplash URL at a given pixel width, serving WebP and quality 70. */
export function dishImageSrc(url: string, width: number): string {
  if (!UNSPLASH_RE.test(url)) return url;
  return `${stripQuery(url)}?w=${width}&q=70&fm=webp`;
}

const DEFAULT_WIDTHS = [400, 640, 800, 1200];

/** `srcSet` for the given widths, derived from a single base URL. */
export function dishImageSrcSet(
  url: string,
  widths: readonly number[] = DEFAULT_WIDTHS,
): string {
  if (!UNSPLASH_RE.test(url)) return url;
  return widths.map((w) => `${dishImageSrc(url, w)} ${w}w`).join(", ");
}