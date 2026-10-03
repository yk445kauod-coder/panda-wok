import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { AsanohaPanel } from "@/components/customer/asian-frames";
import { cn } from "@/lib/utils/format";
import type { AnnouncementRow } from "@/lib/services/content";

/**
 * Tone classes for the four values the `announcements.tone` check allows. The
 * admin picks a tone from a fixed list, so an unknown value falls back to info
 * rather than rendering an unstyled strip.
 *
 * Each tone is a full band, not a translucent chip: a notice is a headline the
 * page hangs off, so it reads as a solid field of colour. `text-rice-50` on a
 * dark band is the pairing the hero and identity bands already use, which keeps
 * the page coherent.
 */
const TONE: Record<string, string> = {
  success: "band-jade text-rice-50",
  info: "band-ink text-rice-50",
  warning: "band-miso text-ink-900",
  plum: "band-plum text-rice-50",
};

/**
 * Staff-authored announcements, rendered as a full-bleed band under the hero.
 *
 * The copy comes entirely from the `announcements` table, so the owner can post
 * or pull a notice from Admin -> Content without a deploy. Nothing renders when
 * there is no active announcement, which is the default state.
 *
 * It sits between two dark sections (the ink hero above, the ink identity band
 * below), so the band colour does real work: it is the change of material that
 * tells the eye this is a deliberate message rather than a strip that fell
 * between two blocks.
 *
 * When several notices are live at once they stack inside the one band and share
 * its tone (taken from the first), because striping the band per row would read
 * as several unrelated messages rather than one announcement block.
 */
export function AnnouncementBanner({
  announcements,
  label,
}: {
  announcements: AnnouncementRow[];
  label: string;
}) {
  if (announcements.length === 0) return null;

  const tone = TONE[announcements[0].tone] ?? TONE.info;

  return (
    <section
      aria-label={label}
      className={cn("announcement-band relative isolate overflow-hidden", tone)}
    >
      {/* Woven ground, the same motif the other bands carry. */}
      <AsanohaPanel className="pointer-events-none absolute inset-0 text-rice-50 opacity-[0.08]" />

      <div className="relative mx-auto flex max-w-6xl items-start gap-4 px-4 py-7 sm:items-center sm:gap-6 sm:py-8">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-rice-50/15 ring-1 ring-rice-50/25 sm:size-12"
        >
          <Megaphone className="size-5 sm:size-6" />
        </span>

        <ul className="flex min-w-0 flex-1 flex-col divide-y divide-current/15">
          {announcements.map((row) => {
            const body = (
              <>
                <span className="min-w-0 flex-1 font-display text-lg leading-snug font-semibold text-balance sm:text-xl">
                  {row.message}
                </span>
                {row.href ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium opacity-90">
                    {label}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </span>
                ) : null}
              </>
            );

            return (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                {row.href ? (
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-4 transition-opacity hover:opacity-90"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
