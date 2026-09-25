"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils/format";

/**
 * The sound switch. Deliberately a small, labelled icon button rather than a
 * floating badge: it is a preference, not a feature to advertise, and the site
 * works identically with it off. It reads its state from the provider, so the
 * header and the footer switch never disagree.
 */
export function SoundToggle({ className }: { className?: string }) {
  const { enabled, toggle } = useSound();
  const t = useT();
  const label = enabled ? t("sound.on") : t("sound.off");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full border border-ink-900/12 bg-rice-50/80 text-ink-700 transition-colors hover:bg-ink-900/5 hover:text-ink-900",
        className,
      )}
    >
      {enabled ? (
        <Volume2 className="size-4" aria-hidden="true" />
      ) : (
        <VolumeX className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
