import type { ReactElement, SVGProps } from "react";

/**
 * Brand marks for the social profiles the kitchen publishes.
 *
 * Kept as inline SVG rather than pulled from an icon library: the running
 * lucide set ships no social glyphs, and these shapes are the ones customers
 * recognise at a glance. Every mark is 24×24, inherits `currentColor` and is
 * `aria-hidden`, so the adjacent text label carries the meaning for assistive
 * technology and translation.
 */
type IconProps = SVGProps<SVGSVGElement>;

export function InstagramIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M14.5 8.5H16V5.8h-2a3.7 3.7 0 0 0-3.7 3.7v2H8v2.7h2.3V21h2.8v-6.8h2.3l.6-2.7h-2.9V9.6a1.1 1.1 0 0 1 1.1-1.1Z" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M14.5 4v10.4a3.6 3.6 0 1 1-3.1-3.56" />
      <path d="M14.5 5.2a4.3 4.3 0 0 0 4 3.1" />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20 11.6A8 8 0 0 1 8.3 18.9L4 20l1.2-4.1A8 8 0 1 1 20 11.6Z" />
      <path d="M9.2 8.4c.3-.1.6 0 .8.3l.7 1.1c.1.2.1.4 0 .6l-.5.6c.5 1 1.3 1.8 2.3 2.3l.6-.5c.2-.1.4-.1.6 0l1.1.7c.2.2.3.5.3.8-.2.9-1 1.5-2 1.4-2.6-.2-5.2-2.8-5.4-5.4-.1-1 .5-1.8 1.5-2Z" />
    </svg>
  );
}

export function WebsiteIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </svg>
  );
}

export type SocialKey = "instagram" | "facebook" | "tiktok" | "whatsapp" | "website";

const ICONS: Record<SocialKey, (props: IconProps) => ReactElement> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  whatsapp: WhatsAppIcon,
  website: WebsiteIcon,
};

/** Resolution order for the profile list, matching how the platforms are promoted. */
const ORDER: SocialKey[] = ["instagram", "facebook", "tiktok", "whatsapp", "website"];

/** Unknown keys fall back to a globe, so a new platform still renders. */
export function socialIcon(key: string): (props: IconProps) => ReactElement {
  return ICONS[key.toLowerCase() as SocialKey] ?? WebsiteIcon;
}

export function sortSocialEntries(
  social: Record<string, string>,
): [string, string][] {
  return Object.entries(social).sort(([a], [b]) => {
    const ai = ORDER.indexOf(a.toLowerCase() as SocialKey);
    const bi = ORDER.indexOf(b.toLowerCase() as SocialKey);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/**
 * Turkish-cased platform name. Known platforms are translated; an unrecognised
 * key falls back to its capitalised form, because settings can publish a
 * profile the dictionary does not know yet and dropping its label would hide
 * the link from sighted users.
 */
export function socialLabel(
  t: (path: string, vars?: Record<string, string | number>) => string,
  key: string,
): string {
  const normalised = key.toLowerCase();
  if (ORDER.includes(normalised as SocialKey)) return t(`social.${normalised}`);
  return key.charAt(0).toUpperCase() + key.slice(1);
}
