import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils/format";
import type { AnnouncementRow } from "@/lib/services/content";

/**
 * Tone classes for the four values the `announcements.tone` check allows. The
 * admin picks a tone from a fixed list, so an unknown value falls back to info
 * rather than rendering an unstyled strip.
 */
const TONE: Record<string, string> = {
  info: "border-bamboo-500/30 bg-bamboo-500/10 text-bamboo-700",
  success: "border-jade-500/30 bg-jade-500/10 text-jade-600",
  warning: "border-miso-500/35 bg-miso-500/12 text-miso-600",
  plum: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600",
};

/**
 * Staff-authored announcements, rendered above the fold on the home page.
 *
 * The copy comes entirely from the `announcements` table, so the owner can post
 * or pull a notice from Admin -> Content without a deploy. Nothing is rendered
 * when there is no active announcement, which is the default state.
 */
export function AnnouncementBanner({
  announcements,
}: {
  announcements: AnnouncementRow[];
}) {
  if (announcements.length === 0) return null;

  return (
    <section aria-label="Announcements" className="mx-auto max-w-6xl px-4 pt-4">
      <Reveal>
        <ul className="space-y-2">
          {announcements.map((row) => {
            const className = cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5",
              TONE[row.tone] ?? TONE.info,
            );
            const body = (
              <span className="flex items-center gap-2.5">
                <Megaphone className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">{row.message}</span>
              </span>
            );

            return (
              <li key={row.id}>
                {row.href ? (
                  <Link href={row.href} className={cn(className, "transition hover:brightness-[1.03]")}>
                    {body}
                    <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Reveal>
    </section>
  );
}
