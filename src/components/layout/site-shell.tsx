import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PandaMascot } from "@/components/layout/panda-mascot";

/**
 * Desktop header. On mobile the bottom navigation carries the load, so this
 * stays out of the way below the md breakpoint.
 */
function DesktopNav({ flags }: { flags: Record<string, boolean> }) {
  const links = [
    { href: "/", label: "Home", flag: null },
    { href: "/menu", label: "Menu", flag: "menu" },
    { href: "/about", label: "About", flag: null },
    { href: "/contact", label: "Contact", flag: null },
    { href: "/loyalty", label: "Loyalty", flag: "loyalty" },
    { href: "/feedback", label: "Feedback", flag: "feedback" },
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

export function SiteHeader({ flags }: { flags: Record<string, boolean> }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-plum-600 focus:px-3 focus:py-2 focus:text-sm focus:text-rice-50"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-ink-900/8 bg-rice-100/85 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-ink-900"
            aria-label="Panda Wok home"
          >
            <div className="flex items-center">
              <PandaMascot />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Panda&nbsp;Wok
            </span>
          </Link>

          <DesktopNav flags={flags} />

          <div className="flex items-center gap-2">
            {flags.ordering !== false ? (
              <Link
                href="/cart"
                className="hidden rounded-lg bg-plum-600 px-3.5 py-2 text-sm font-medium text-rice-50 transition-colors hover:bg-plum-700 md:inline-flex"
              >
                Basket
              </Link>
            ) : null}
            <Link
              href="/account"
              className="rounded-lg border border-ink-900/12 px-3 py-2 text-sm text-ink-800 transition-colors hover:bg-ink-900/5"
            >
              Account
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

/** Panda mascot mark, hand-drawn as inline SVG. */
export function PandaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" fill="#1b1815" />
      <circle cx="31" cy="9" r="6.5" fill="#1b1815" />
      <circle cx="9" cy="9" r="3" fill="#efe7d4" opacity="0.28" />
      <circle cx="31" cy="9" r="3" fill="#efe7d4" opacity="0.28" />
      <circle cx="20" cy="22" r="15.5" fill="#fdfbf5" stroke="#1b1815" strokeWidth="1.4" />
      <ellipse cx="13.6" cy="19.5" rx="4.3" ry="5" fill="#1b1815" transform="rotate(-14 13.6 19.5)" />
      <ellipse cx="26.4" cy="19.5" rx="4.3" ry="5" fill="#1b1815" transform="rotate(14 26.4 19.5)" />
      <circle cx="14.4" cy="19" r="1.35" fill="#fdfbf5" />
      <circle cx="25.6" cy="19" r="1.35" fill="#fdfbf5" />
      <ellipse cx="20" cy="27" rx="2.4" ry="1.7" fill="#1b1815" />
      <path
        d="M20 28.6v1.6M20 30.2c-1.1 1.3-2.6 1.3-3.4.4M20 30.2c1.1 1.3 2.6 1.3 3.4.4"
        stroke="#1b1815"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SiteFooter({
  brand,
  contact,
}: {
  brand: { name: string; city: string; country: string; tagline: string };
  contact: { phone: string | null; email: string | null; social: Record<string, string> };
}) {
  const socialEntries = Object.entries(contact.social);
  return (
    <footer className="mt-12 border-t border-ink-900/10 bg-rice-50/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <PandaMark className="size-8" />
            <span className="font-display text-lg font-semibold">{brand.name}</span>
          </div>
          <p className="mt-2 max-w-xs text-sm text-ink-700/80">{brand.tagline}</p>
          <p className="mt-2 text-sm text-ink-700/70">
            {brand.city}, {brand.country}
          </p>
        </div>

        <nav aria-label="Explore">
          <h2 className="text-sm font-semibold text-ink-900">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700/85">
            <li><Link className="hover:text-ink-900" href="/menu">Menu</Link></li>
            <li><Link className="hover:text-ink-900" href="/about">About</Link></li>
            <li><Link className="hover:text-ink-900" href="/loyalty">Loyalty</Link></li>
            <li><Link className="hover:text-ink-900" href="/feedback">Feedback</Link></li>
          </ul>
        </nav>

        <nav aria-label="Account">
          <h2 className="text-sm font-semibold text-ink-900">Your account</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700/85">
            <li><Link className="hover:text-ink-900" href="/account">Account</Link></li>
            <li><Link className="hover:text-ink-900" href="/orders">Order tracking</Link></li>
            <li><Link className="hover:text-ink-900" href="/cart">Basket</Link></li>
            <li><Link className="hover:text-ink-900" href="/contact">Contact</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-ink-900">Reach the kitchen</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700/85">
            {contact.phone ? (
              <li>
                <a href={`tel:${contact.phone}`} className="hover:text-ink-900">
                  {contact.phone}
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
            {socialEntries.map(([key, url]) => (
              <li key={key}>
                <a
                  href={url}
                  rel="noopener noreferrer me"
                  target="_blank"
                  className="capitalize hover:text-ink-900"
                >
                  {key}
                </a>
              </li>
            ))}
            {!contact.phone && !contact.email && socialEntries.length === 0 ? (
              <li className="text-ink-700/60">
                Contact details are being finalised.
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-900/8 px-4 py-5">
        <p className="mx-auto max-w-6xl text-xs text-ink-700/60">
          © {new Date().getFullYear()} {brand.name}. Cloud kitchen, {brand.city}. All
          prices in EGP.
        </p>
      </div>
    </footer>
  );
}

export { BottomNav };
