import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FooterSocial } from "@/components/layout/mobile-footer";
import { HeaderNotifications } from "@/components/notifications/header-notifications";
import { sortSocialEntries } from "@/components/icons/social";
import { localePath, type Locale } from "@/lib/i18n/config";
import { staticT } from "@/lib/i18n/static";
import type { Translator } from "@/lib/i18n/translate";

/**
 * Desktop header. On mobile the bottom navigation carries the load, so this
 * stays out of the way below the md breakpoint.
 */
function DesktopNav({
  flags,
  t,
  locale,
}: {
  flags: Record<string, boolean>;
  t: Translator;
  locale: Locale;
}) {
  const links = [
    { href: localePath(locale, "/"), label: t("nav.home"), flag: null },
    { href: localePath(locale, "/menu"), label: t("nav.menu"), flag: "menu" },
    { href: localePath(locale, "/about"), label: t("nav.about"), flag: null },
    { href: localePath(locale, "/contact"), label: t("nav.contact"), flag: null },
    { href: localePath(locale, "/feedback"), label: t("nav.feedback"), flag: "feedback" },
    { href: localePath(locale, "/orders"), label: t("nav.orderTracking"), flag: null },
    { href: localePath(locale, "/chat"), label: t("nav.messages"), flag: "chat" },
  ].filter((l) => l.flag === null || flags[l.flag] !== false);

  return (
    <div className="hidden md:flex md:items-center md:gap-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-900/5 hover:text-ink-900"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function SiteHeader({
  brand,
  flags,
  locale,
}: {
  brand: { name: string; logo_url: string | null };
  flags: Record<string, boolean>;
  locale: Locale;
}) {
  const t = staticT(locale);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-vermilion-600 focus:px-3 focus:py-2 focus:text-sm focus:text-rice-50"
      >
        {t("common.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-ink-900/8 washi-paper pt-safe">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href={localePath(locale, "/")}
            className="flex items-center gap-2.5 text-ink-900"
            aria-label={t("nav.brandHome", { brand: brand.name })}
          >
            <span className="grid size-10 place-items-center rounded-xl border border-ink-900/10 bg-rice-50 shadow-washi">
              <BrandLogo brand={brand} className="size-8 rounded-lg" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight sm:text-xl">
              {brand.name}
            </span>
          </Link>

          <DesktopNav flags={flags} t={t} locale={locale} />

          <div className="flex items-center gap-2">
            <LanguageSwitcher current={locale} />
            <HeaderNotifications />
            {flags.ordering !== false ? (
              <Link
                href={localePath(locale, "/cart")}
                className="hidden rounded-lg bg-vermilion-600 px-3.5 py-2 text-sm font-medium text-rice-50 transition-colors hover:bg-vermilion-700 md:inline-flex"
              >
                {t("nav.basket")}
              </Link>
            ) : null}
            <Link
              href={localePath(locale, "/account")}
              className="hidden rounded-lg border border-ink-900/12 px-3 py-2 text-sm text-ink-800 transition-colors hover:bg-ink-900/5 md:inline-flex"
            >
              {t("nav.account")}
            </Link>
            <MobileNav flags={flags} signedIn={false} />
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter({
  brand,
  contact,
  locale,
}: {
  brand: {
    name: string;
    city: string;
    country: string;
    tagline: string;
    logo_url: string | null;
  };
  contact: {
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    social: Record<string, string>;
  };
  locale: Locale;
}) {
  const t = staticT(locale);
  const socialEntries = sortSocialEntries(contact.social);

  // Built once and rendered twice: as an accordion on phones, as plain columns
  // from `sm` up. The data is identical, only the disclosure differs.
  const sections = [
    {
      key: "explore",
      heading: t("footer.explore"),
      links: [
        { href: localePath(locale, "/menu"), label: t("nav.menu") },
        { href: localePath(locale, "/about"), label: t("nav.about") },
        { href: localePath(locale, "/location"), label: t("nav.location") },
        { href: localePath(locale, "/faq"), label: t("nav.faq") },
        { href: localePath(locale, "/feedback"), label: t("nav.feedback") },
      ],
    },
    {
      key: "account",
      heading: t("footer.account"),
      links: [
        { href: localePath(locale, "/account"), label: t("nav.account") },
        { href: localePath(locale, "/orders"), label: t("nav.orderTracking") },
        { href: localePath(locale, "/cart"), label: t("nav.basket") },
        { href: localePath(locale, "/contact"), label: t("nav.contact") },
        { href: localePath(locale, "/privacy-policy"), label: t("nav.privacy") },
      ],
    },
  ];

  return (
    // `hidden sm:block` by request: the footer is desktop-only. Everything a
    // phone user needs is reachable elsewhere — the header carries the nav and
    // the language switcher, and /contact carries every channel the footer
    // listed, so nothing is orphaned by hiding it.
    <footer className="mt-12 hidden border-t border-ink-900/10 washi-paper sm:block">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 sm:gap-8 sm:py-10 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <BrandLogo brand={brand} className="size-9" />
            <span className="font-display text-lg font-semibold">{brand.name}</span>
          </div>
          <p className="mt-2 max-w-xs text-sm text-ink-700/80">{brand.tagline}</p>
          <p className="mt-2 text-sm text-ink-700/70">
            {brand.city}, {brand.country}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <LanguageSwitcher current={locale} variant="labelled" />
          </div>
        </div>

        {sections.map((section) => (
          <nav key={section.key} aria-label={section.heading} className="hidden sm:block">
            <h2 className="text-sm font-semibold text-ink-900">{section.heading}</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-700/85">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link className="hover:text-ink-900" href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="text-sm font-semibold text-ink-900">{t("footer.reachKitchen")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700/85">
            {contact.phone ? (
              <li>
                <a href={`tel:${contact.phone}`} className="hover:text-ink-900">
                  {contact.phone}
                </a>
              </li>
            ) : null}
            {contact.phoneSecondary ? (
              <li>
                <a href={`tel:${contact.phoneSecondary}`} className="hover:text-ink-900">
                  {contact.phoneSecondary}
                </a>
              </li>
            ) : null}
            {contact.email ? (
              <li>
                <a href={`mailto:${contact.email}`} className="hover:text-ink-900">
                  {contact.email}
                </a>
              </li>
            ) : null}
          </ul>

          {socialEntries.length > 0 ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-ink-900">{t("footer.followUs")}</h2>
              <FooterSocial social={contact.social} className="mt-3 flex flex-wrap gap-2" />
            </div>
          ) : null}

          {!contact.phone && !contact.phoneSecondary && !contact.email && socialEntries.length === 0 ? (
            <p className="mt-3 text-ink-700/60">{t("footer.contactPending")}</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-ink-900/8 px-4 py-5">
        <p className="mx-auto max-w-6xl text-xs text-ink-700/60">
          {t("footer.copyright", {
            year: new Date().getFullYear(),
            brand: brand.name,
            city: brand.city,
          })}
        </p>
      </div>
    </footer>
  );
}

export { BottomNav };
