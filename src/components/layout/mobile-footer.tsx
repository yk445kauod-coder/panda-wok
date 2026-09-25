"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { socialIcon, socialLabel, sortSocialEntries } from "@/components/icons/social";

type Section = {
  key: string;
  heading: string;
  links: { href: string; label: string }[];
};

/**
 * The footer on phones.
 *
 * The four-column desktop footer becomes one long wall of links on a narrow
 * screen — it pushed the contact details and the social row past a full swipe
 * of scrolling, and the address was the only thing anyone actually wanted. So
 * on small screens the link columns collapse into disclosure sections: closed
 * by default, one tap to open, only the current page's neighbours expanded.
 *
 * The contact block and the social row stay visible without a tap, because
 * reaching the kitchen is the one job the footer has.
 */
export function MobileFooterSections({
  sections,
  brandName,
  className,
}: {
  sections: Section[];
  brandName: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className={className}>
      {sections.map((section) => {
        const expanded = open === section.key;
        return (
          <div key={section.key} className="border-b border-ink-900/8">
            <h2>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : section.key)}
                aria-expanded={expanded}
                aria-controls={`footer-panel-${section.key}`}
                className="flex w-full items-center justify-between gap-3 py-3 text-start text-sm font-semibold text-ink-900"
              >
                {section.heading}
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 shrink-0 text-ink-500 transition-transform duration-200 ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h2>
            <div
              id={`footer-panel-${section.key}`}
              hidden={!expanded}
              className="pb-3"
            >
              <ul className="space-y-1">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block rounded-lg px-2 py-2 text-sm text-ink-700/85 active:bg-ink-900/5"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
      <span className="sr-only">{brandName}</span>
      <span className="sr-only">{t("footer.explore")}</span>
    </div>
  );
}

/** Social icon row, shared by the phone and desktop footers. */
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
              className="inline-flex size-10 items-center justify-center rounded-xl border border-ink-900/12 text-ink-700 transition-colors hover:border-indigo-600/40 hover:bg-indigo-600/8 hover:text-indigo-700"
            >
              <Icon className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
