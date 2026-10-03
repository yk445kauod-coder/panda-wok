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
 * The script marks that sign the brand: the shop's name written in the two
 * Asian scripts the kitchen belongs to, used as decoration (`aria-hidden`)
 * wherever the brand is introduced.
 *
 * They render in `.font-kana`, a hand-built Mincho subset (see the note on
 * `scripts/build-kana-font.mjs`). That face is Japanese, so every glyph must be
 * one a Japanese Mincho actually ships — a simplified-only character (锅, 华)
 * is absent and the browser substitutes a different font for that one glyph,
 * which renders the mark half in one typeface and half in another. That is why
 * these are 鍋 and 貓 (traditional forms), not 锅 / 猫.
 *
 * 熊猫 = "panda", 鍋 = "wok"/"pot" (also Japanese 鍋, the nabe the dish is named
 * after). The Japanese mark uses katakana パンダ rather than kanji 熊猫, because
 * that is how a Japanese menu would actually write it.
 */
export const BRAND_SCRIPT_MARK_ZH = "熊猫鍋";
export const BRAND_SCRIPT_MARK_JA = "パンダ鍋";

/**
 * @deprecated Kept as the Chinese mark so 中華-era call sites keep resolving;
 * prefer `BRAND_SCRIPT_MARK_ZH`.
 */
export const BRAND_SCRIPT_MARK = BRAND_SCRIPT_MARK_ZH;
