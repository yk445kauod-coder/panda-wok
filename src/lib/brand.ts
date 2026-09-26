/**
 * The one canonical brand mark: `public/panda-logo.svg`, the panda mark that
 * ships in the repository. Everything that renders the brand — navbar, footer,
 * auth, favicon, PWA manifest, OG image, hero plate — points here, so the mark
 * can never drift between surfaces.
 *
 * Serving it from the app origin (not a third-party host) keeps the logo
 * available offline, on first paint, and independent of an external CDN. An
 * admin-uploaded `brand.logo_url` still overrides it in the CMS.
 */
export const BRAND_LOGO_URL = "/panda-logo.svg";

/** SVG scales cleanly, so the icon is the same asset. */
export const BRAND_ICON_URL = BRAND_LOGO_URL;

/**
 * The script mark that heads the hero and the brand banner: the kitchen's wok,
 * named in Chinese. It is decorative (`aria-hidden`) and rendered in
 * `.font-kana`, which is a Mincho face — so each glyph must be one that face
 * actually ships. 中華 (traditional) is; 华 (simplified) is not, and would fall
 * back to a second font mid-mark. The Arabic locale shows the country name
 * instead, so it does not use this string.
 */
export const BRAND_SCRIPT_MARK = "中華";
