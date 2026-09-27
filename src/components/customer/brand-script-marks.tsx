import { BRAND_SCRIPT_MARK_JA, BRAND_SCRIPT_MARK_ZH } from "@/lib/brand";

/**
 * The brand's name in its two scripts, printed together as decoration.
 *
 * Both marks live in one component so a third surface cannot show one script,
 * a second surface the other, and the pair can never drift apart. It is
 * `aria-hidden`: a screen reader hears the brand name from the heading beside
 * it, not a script it cannot pronounce.
 *
 * The wrapper always carries `.font-kana`; callers own the size, tone and
 * tracking, because the hero sits on ink while the banner sits on rice.
 */
export function BrandScriptMarks({ className = "" }: { className?: string }) {
  return (
    <p aria-hidden="true" className={`font-kana ${className}`.trim()}>
      <span>{BRAND_SCRIPT_MARK_ZH}</span>
      <span className="mx-2.5 opacity-60">·</span>
      <span>{BRAND_SCRIPT_MARK_JA}</span>
    </p>
  );
}
