import Link from "next/link";
import { Phone } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { socialIcon, socialLabel, sortSocialEntries } from "@/components/icons/social";
import { AsanohaPanel, BambooRails } from "@/components/customer/asian-frames";
import { BRAND_SCRIPT_MARK } from "@/lib/brand";
import type { T } from "@/lib/i18n/server";

/**
 * BrandBanner — the closing brand banner on the home page.
 *
 * Prints the kitchen's real identity: the uploaded logo, the live tagline, the
 * cuisine tags and the published contact/social channels. Nothing here is
 * invented; empty channels are simply omitted.
 */
export function BrandBanner({
  brand,
  city,
  tagline,
  cuisine,
  logoUrl,
  contact,
  t,
}: {
  brand: string;
  city: string;
  tagline: string;
  cuisine: string | null;
  logoUrl: string | null;
  contact: {
    phone: string | null;
    whatsapp: string | null;
    social: Record<string, string>;
  };
  t: T;
}) {
  const socialEntries = sortSocialEntries(contact.social);
  const whatsappHref = contact.whatsapp
    ? `https://wa.me/${contact.whatsapp.replace(/\D/g, "").replace(/^0/, "20")}`
    : null;

  return (
    <section className="relative overflow-hidden border-y border-ink-900/10 bg-gradient-to-b from-rice-100 via-rice-50 to-rice-200">
      <AsanohaPanel className="opacity-60" />
      <BambooRails />
      <BambooRails flip />
      <div className="relative mx-auto max-w-3xl px-4 py-14 text-center sm:py-20">
        <div className="mx-auto flex size-24 items-center justify-center rounded-full border border-bamboo-600/25 bg-rice-50 shadow-washi-lg">
          <BrandLogo brand={{ name: brand, logo_url: logoUrl }} className="size-20 rounded-full" />
        </div>

        <h2 className="mt-6 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          {brand}
        </h2>
        <p aria-hidden="true" className="font-kana mt-2 text-sm font-semibold tracking-[0.35em] text-plum-700">
          {BRAND_SCRIPT_MARK}
        </p>
        <p className="mx-auto mt-4 max-w-xl text-base text-ink-700/90">{tagline}</p>
        {cuisine ? <p className="mt-2 text-sm text-ink-700/70">{cuisine} · {city}</p> : null}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/menu"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-plum-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-plum-700"
          >
            {t("home.viewMenu")}
          </Link>
          {contact.phone ? (
            <a
              href={`tel:${contact.phone.replace(/\s+/g, "")}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-900/15 bg-rice-50/80 px-5 font-medium text-ink-900 transition-colors hover:bg-rice-100"
            >
              <Phone className="size-4" aria-hidden="true" />
              <span dir="ltr">{contact.phone}</span>
            </a>
          ) : null}
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-jade-600/30 bg-jade-500/10 px-5 font-medium text-jade-600 transition-colors hover:bg-jade-500/20"
            >
              <span dir="ltr">{contact.whatsapp}</span>
            </a>
          ) : null}
        </div>

        {socialEntries.length > 0 ? (
          <div className="mt-8">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-ink-700/70">
              {t("footer.followUs")}
            </p>
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {socialEntries.map(([key, url]) => {
                const Icon = socialIcon(key);
                return (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={socialLabel(t, key)}
                      className="inline-flex size-10 items-center justify-center rounded-full border border-ink-900/12 bg-rice-50 text-ink-700 transition-colors hover:text-plum-600"
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
