import type { Locale } from "@/lib/i18n/config";

const TIERS = {
  bronze: { en: "Bronze", ar: "برونزي" },
  silver: { en: "Silver", ar: "فضي" },
  gold: { en: "Gold", ar: "ذهبي" },
  platinum: { en: "Platinum", ar: "بلاتيني" },
} as const;

export type LoyaltyTier = keyof typeof TIERS;

/** Human-readable loyalty tier label in the active language. */
export function tierLabel(tier: string, locale: Locale): string {
  const known = TIERS[tier as LoyaltyTier];
  if (locale === "ar" && known) return known.ar;
  if (known) return known.en;
  return tier;
}