import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { MobileFooterSections, FooterSocial } from "@/components/layout/mobile-footer";
import { sortSocialEntries } from "@/components/icons/social";
import { getLocale, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/server";

/**
 * Desktop header. On mobile the bottom navigation carries the load, so this
 * stays out of the way below the md breakpoint.
 */
function DesktopNav({
  flags,
  t,
}: {
  flags: Record<string, boolean>;
  t: T;
}) {
  const links = [
    { href: "/", label: t("nav.home"), flag: null },
    { href: "/menu", label: t("nav.menu"), flag: "menu" },
    { href: "/about", label: t("nav.about"), flag: null },
    { href: "/contact", label: t("nav.contact"), flag: null },
    { href: "/loyalty", label: t("nav.loyalty"), flag: "loyalty" },
    { href: "/feedback", label: t("nav.feedback"), flag: "feedback" },
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

export async function SiteHeader({
  brand,
  flags,
}: {
  brand: { name: string; logo_url: string | null };
  flags: Record<string, boolean>;
}) {
  const locale = await getLocale();
  const t = await getT(locale);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:text-rice-50"
      >
        {t("common.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-ink-900/8 bg-rice-100/85 pt-safe backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
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

          <DesktopNav flags={flags} t={t} />

          <div className="flex items-center gap-2">
            <LanguageSwitcher current={locale} />
            {flags.ordering !== false ? (
              <Link
                href="/cart"
                className="hidden rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-rice-50 transition-colors hover:bg-indigo-700 md:inline-flex"
              >
                {t("nav.basket")}
              </Link>
            ) : null}
            <Link
              href="/account"
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm text-ink-800 transition-colors hover:bg-ink-900/5"
            >
              {t("nav.account")}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

export async function SiteFooter({
  brand,
  contact,
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
}) {
  const locale = await getLocale();
  const t = await getT(locale);
  const socialEntries = sortSocialEntries(contact.social);

  // Built once and rendered twice: as an accordion on phones, as plain columns
  // from `sm` up. The data is identical, only the disclosure differs.
  const sections = [
    {
      key: "explore",
      heading: t("footer.explore"),
      links: [
        { href: "/menu", label: t("nav.menu") },
        { href: "/about", label: t("nav.about") },
        { href: "/location", label: t("nav.location") },
        { href: "/faq", label: t("nav.faq") },
        { href: "/loyalty", label: t("nav.loyalty") },
        { href: "/feedback", label: t("nav.feedback") },
      ],
    },
    {
      key: "account",
      heading: t("footer.account"),
      links: [
        { href: "/account", label: t("nav.account") },
        { href: "/orders", label: t("nav.orderTracking") },
        { href: "/cart", label: t("nav.basket") },
        { href: "/contact", label: t("nav.contact") },
        { href: "/privacy-policy", label: t("nav.privacy") },
      ],
    },
  ];

  return (
    <footer className="mt-12 border-t border-ink-900/10 bg-rice-50/70">
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

        {/* Phones: collapsible. Desktop: the two columns as before. */}
        <MobileFooterSections
          sections={sections}
          brandName={brand.name}
          className="sm:hidden"
        />

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
