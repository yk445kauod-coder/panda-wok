"use client";

import { useT } from "@/components/i18n-provider";
import { socialIcon, socialLabel, sortSocialEntries } from "@/components/icons/social";

/** Social icon row for the desktop footer. */
export function FooterSocial({
  social,
  className,
}: {
  social: Record<string, string>;
  className?: string;
}) {
  const t = useT();
  const entries = sortSocialEntries(social);
  if (entries.length === 0) return null;

  return (
    <ul className={className}>
      {entries.map(([key, url]) => {
        const Icon = socialIcon(key);
        const label = socialLabel(t, key);
        return (
          <li key={key}>
            <a
              href={url}
              rel="noopener noreferrer me"
              target="_blank"
              aria-label={label}
              title={label}
              className="inline-flex size-10 items-center justify-center rounded-xl border border-ink-900/12 text-ink-700 transition-colors hover:border-vermilion-600/40 hover:bg-vermilion-600/8 hover:text-vermilion-700"
            >
              <Icon className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
