import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Globe, MapPin, Star } from "lucide-react";
import {
  getFeaturedItems,
  getMenuRatings,
  getPublicCategories,
  getPublicMenu,
  getPublicSettings,
  getRestaurant,
} from "@/lib/services/catalog";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { menuSchema } from "@/lib/seo/schema";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { FeaturedDishStrip } from "@/components/customer/featured-strip";
import { IdentityBand } from "@/components/customer/identity-band";
import { PopularMenu } from "@/components/customer/popular-menu";
import {
  DiscoverSeal,
  EditorialSections,
} from "@/components/customer/editorial-sections";
import { BambooAmbience } from "@/components/customer/bamboo-ambience";
import { AsanohaPanel } from "@/components/customer/asian-frames";
import { SakuraField } from "@/components/customer/sakura-field";
import { LeafField2D } from "@/components/customer/leaf-field-2d";
import { HeroGallery } from "@/components/customer/hero-gallery";
import { BRAND_LOGO_URL, BRAND_SCRIPT_MARK } from "@/lib/brand";
import { BrandBanner } from "@/components/customer/brand-banner";
import { getLocale, getT } from "@/lib/i18n/server";
import { brandDescription, brandTagline } from "@/lib/i18n/brand";
import type { T } from "@/lib/i18n/server";
import { localiseCategory } from "@/lib/i18n/catalog";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    // The home title already ends in the brand name, so it opts out of the root
    // layout's `%s | Panda Wok` template; otherwise the brand is printed twice.
    title: {
      absolute: t("home.metaTitle", {
        brand: settings.brand.name,
        tagline: settings.brand.tagline,
      }),
    },
    description: t("home.metaDescription", {
      tagline: settings.brand.tagline,
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: "/",
    keywords: [
      settings.brand.name,
      `food delivery ${settings.brand.city}`,
      `cloud kitchen ${settings.brand.city}`,
    ],
    siteName: settings.brand.name,
    locale,
  });
}

export default async function HomePage() {
  const [featured, categories, menu, settings, restaurant, locale, ratings] =
    await Promise.all([
      getFeaturedItems(6),
      getPublicCategories(),
      getPublicMenu(),
      getPublicSettings(),
      getRestaurant(),
      getLocale(),
      getMenuRatings(),
    ]);
  const t = await getT(locale);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const currency = restaurant?.currency ?? "EGP";
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const ratingRecord = Object.fromEntries(ratings);

  // A section is only worth a card if it holds at least one dish. Showing empty
  // sections invites a tap that lands on a blank page, which reads as broken.
  const visibleCategories = categories.filter((category) =>
    menu.items.some((item) => item.category_id === category.id),
  );

  // The live cuisine tags are the honest description of the kitchen ("Japanese-
  // inspired", "Chinese-inspired", …). They are shown verbatim rather than
  // replaced by a slogan, so the page never claims more than the menu supports.
  const cuisineIdentity =
    restaurant?.cuisine_tags && restaurant.cuisine_tags.length > 0
      ? restaurant.cuisine_tags.slice(0, 4).join(" · ")
      : settings.brand.cuisine;

  const menuItems = menu.items.slice(0, 40).map((item) => ({
    slug: item.slug,
    name: item.name_en,
    description: item.description_en,
    price: Number(item.price),
    currency,
    image: item.image_url,
    category:
      categoryById.get(item.category_id)?.name_en ?? t("menu.categoryFallback"),
    available: item.is_available,
    vegetarian: item.is_vegetarian,
    vegan: item.is_vegan,
  }));

  const structured = menuSchema({
    name: `${brand} menu`,
    description: brandDescription(restaurant, locale, settings.brand.tagline),
    url: "/menu",
    items: menuItems,
  });

  // "Popular" is a real ordering, not a hand-picked list: the kitchen's featured
  // flag first, then everything else in the order the admin set. The band shows
  // the full published menu so the category filters have something to filter.
  const popularItems = [...menu.items]
    .filter((item) => item.is_available)
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
    .slice(0, 12)
    .map((item) => {
      const category = categoryById.get(item.category_id);
      return {
        item,
        categoryId: item.category_id,
        categoryName: category
          ? localiseCategory(category, locale).name
          : t("menu.categoryFallback"),
      };
    });

  const popularCategoryIds = new Set(popularItems.map((entry) => entry.categoryId));
  const popularCategories = visibleCategories
    .filter((category) => popularCategoryIds.has(category.id))
    .map((category) => ({
      id: category.id,
      name: localiseCategory(category, locale).name,
    }));

  // Editorial rows are built from the kitchen's own category records, so
  // whichever sections the admin has published are exactly the ones shown.
  const editorialSections = visibleCategories
    .map((category) => {
      const items = menu.items.filter((item) => item.category_id === category.id);
      const localised = localiseCategory(category, locale);
      return {
        categoryId: category.id,
        slug: category.slug,
        name: localised.name,
        nameJa: category.name_ja ?? null,
        description:
          locale === "ar" && category.description_ar?.trim()
            ? category.description_ar
            : (category.description_en ?? null),
        items,
      };
    })
    .filter((section) => section.items.length > 1)
    .slice(0, 3);

  const avgRating = computeAverageRating(ratings);

  return (
    <>
      <Hero
        brand={brand}
        tagline={brandTagline(restaurant, locale, settings.brand.tagline)}
        acceptingOrders={settings.ordering.acceptingOrders}
        hasMenu={menu.items.length > 0}
        logoUrl={BRAND_LOGO_URL}
        locale={locale}
        t={t}
        stats={{
          dishCount: menu.items.length,
          rating: avgRating,
          city: settings.brand.city,
        }}
      />

      <IdentityBand
        brand={brand}
        city={settings.brand.city}
        cuisineTags={restaurant?.cuisine_tags ?? []}
        locale={locale}
        t={t}
      />

      {featured.length > 0 ? (
        <section
          aria-labelledby="featured-heading"
          className="mx-auto max-w-6xl px-4 py-10"
        >
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  id="featured-heading"
                  className="font-display text-fluid-h2 font-semibold text-ink-900"
                >
                  {t("home.featuredHeading")}
                </h2>
                <span aria-hidden="true" className="eyebrow-rule mt-3" />
                <p className="mt-3 text-sm text-ink-700/80">
                  {t("home.featuredSubheading")}
                </p>
              </div>
              <Link
                href="/menu"
                className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-vermilion-600 hover:text-vermilion-700 sm:inline-flex"
              >
                {t("home.fullMenu")}{" "}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
            <FeaturedDishStrip items={featured} currency={currency} locale={locale} />
          </Reveal>
        </section>
      ) : null}

      {visibleCategories.length > 0 ? (
        <section
          aria-labelledby="categories-heading"
          className="mx-auto max-w-6xl px-4 py-6"
        >
          <Reveal>
            <h2
              id="categories-heading"
              className="font-display text-fluid-h2 font-semibold text-ink-900"
            >
              {t("home.browseBySection")}
            </h2>
            <span aria-hidden="true" className="eyebrow-rule mt-3" />
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {visibleCategories.map((category, index) => {
                const local = localiseCategory(category, locale);
                const count = menu.items.filter(
                  (i) => i.category_id === category.id,
                ).length;
                return (
                  <Reveal as="li" key={category.id} delay={Math.min(index, 8) * 40}>
                    <Link
                      href={`/menu/${category.slug}`}
                      className="dish-card group flex h-full flex-col justify-between p-4"
                    >
                      <span className="font-display text-base font-semibold text-ink-900">
                        {local.name}
                      </span>
                      {category.name_ja ? (
                        <span className="mt-0.5 text-xs text-ink-700/60" lang="ja">
                          {category.name_ja}
                        </span>
                      ) : null}
                      <span className="mt-3 text-xs text-ink-700/70">
                        {count} {count === 1 ? t("common.dish") : t("common.dishes")}
                      </span>
                    </Link>
                  </Reveal>
                );
              })}
            </ul>
          </Reveal>
        </section>
      ) : null}

      {popularItems.length > 0 ? (
        /* The popular band. It is a coloured full-bleed section so the eye gets
           a change of material between the paper pages around it; the cards
           inside use the on-band treatment. */
        <section
          aria-labelledby="popular-heading"
          className="relative isolate mt-16 overflow-x-clip pb-14"
        >
          {/* One background layer carries both the band colour and the curved
              top edge, so the gradient runs across the curve instead of
              restarting under it. `isolate` keeps the -z-10 layer inside this
              section rather than behind the page ground. */}
          <div
            aria-hidden="true"
            className="band-vermilion band-layer band-layer-curve-top"
          />
          <AsanohaPanel className="pointer-events-none absolute inset-0 text-rice-50 opacity-[0.07]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-10">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.28em] text-rice-100/80 uppercase">
                    {t("home.eyebrowLabel")}
                  </p>
                  <h2
                    id="popular-heading"
                    className="mt-2 font-display text-fluid-h2 font-semibold text-rice-50"
                  >
                    {t("home.popularHeading")}
                  </h2>
                  <span
                    aria-hidden="true"
                    className="mt-3 block h-[3px] w-10 rounded-full bg-rice-50"
                  />
                  <p className="mt-3 text-sm text-rice-100/85">
                    {t("home.popularSubheading")}
                  </p>
                </div>
              </div>
            </Reveal>

            <div className="mt-8">
              <PopularMenu
                items={popularItems}
                categories={popularCategories}
                currency={currency}
                locale={locale}
                ratings={ratingRecord}
                onBand
              />
            </div>
          </div>
        </section>
      ) : (
        <Reveal as="section" className="mx-auto max-w-6xl px-4 py-10" delay={120}>
          <EmptyState
            title={t("home.noDishesTitle")}
            description={t("home.noDishesBody")}
            action={
              <Link
                href="/contact"
                className="text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
              >
                {t("common.contactKitchen")}
              </Link>
            }
          />
        </Reveal>
      )}

      {editorialSections.length > 0 ? (
        <section
          aria-labelledby="editorial-heading"
          /* `overflow-x-clip` because the rows below enter with a horizontal
             slide: a transformed box still counts toward the document's
             scrollable overflow, so on a phone (where this section spans the
             full viewport) the pending transform widened the page by ~17px.
             Clipping the host contains it without changing the animation. */
          className="relative mx-auto max-w-6xl overflow-x-clip px-4 py-16"
        >
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.28em] text-vermilion-600 uppercase">
                {t("home.editorialEyebrow")}
              </p>
              <h2
                id="editorial-heading"
                className="mt-2 font-display text-fluid-h2 font-semibold text-ink-900"
              >
                {t("home.editorialKitchenTitle")}
              </h2>
              <span aria-hidden="true" className="eyebrow-rule mt-3" />
              <p className="mt-4 text-sm leading-relaxed text-ink-700/85">
                {t("home.editorialKitchenBody")}
              </p>
              <Link
                href="/about"
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-vermilion-600 hover:text-vermilion-700"
              >
                {t("home.editorialLearnMore")}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          {/* The seal sits on the section junction, the way the reference
              threads its spreads together. Decorative, so it is hidden from
              assistive tech. */}
          <DiscoverSeal
            label={t("home.editorialDiscover")}
            className="mx-auto my-12 hidden lg:grid"
          />

          <EditorialSections sections={editorialSections} locale={locale} />
        </section>
      ) : null}

      <ClosingCta
        brand={brand}
        city={settings.brand.city}
        phone={settings.support.phone}
        whatsapp={settings.support.social?.whatsapp ?? settings.support.phone}
        t={t}
      />

      <BrandBanner
        brand={brand}
        city={settings.brand.city}
        tagline={brandTagline(restaurant, locale, settings.brand.tagline)}
        cuisine={cuisineIdentity}
        logoUrl={settings.brand.logo_url}
        contact={settings.support}
        t={t}
      />

      <JsonLdScript data={structured} />
    </>
  );
}

/**
 * Average of the per-dish averages, weighted by each dish's rating count.
 *
 * Weighted rather than a flat mean of means: a dish with one rating must not
 * pull the headline number as hard as a dish with fifty. Returns null when
 * nothing has been rated, and the hero then shows no rating at all.
 */
function computeAverageRating(
  ratings: Map<string, { average: number; count: number }>,
): { average: number; count: number } | null {
  let weighted = 0;
  let count = 0;
  for (const rating of ratings.values()) {
    weighted += rating.average * rating.count;
    count += rating.count;
  }
  if (count === 0) return null;
  return { average: Math.round((weighted / count) * 10) / 10, count };
}

function Hero({
  brand,
  tagline,
  acceptingOrders,
  hasMenu,
  logoUrl,
  locale,
  t,
  stats,
}: {
  brand: string;
  tagline: string;
  acceptingOrders: boolean;
  hasMenu: boolean;
  logoUrl: string;
  locale: string;
  t: T;
  stats: {
    dishCount: number;
    rating: { average: number; count: number } | null;
    city: string;
  };
}) {
  return (
    <section className="hero-night relative overflow-hidden border-b border-rice-100/10">
      {/* The Riso Sweep plate is the hero's ground. It is inert to the pointer
          on touch devices so the page still scrolls and the copy still taps
          through; on a fine pointer it takes hover, which is what drives the
          ring's authored orbit. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 pointer-fine:pointer-events-auto"
      >
        <HeroGallery />
      </div>
      <AsanohaPanel className="asanoha-light opacity-[0.28]" />
      <BambooAmbience locale={locale} />
      {/* Cherry blossom for the Japanese half of the kitchen; the Chinese wok
          half is carried by the bamboo standing behind the copy. */}
      <SakuraField density={0.7} />
      {/* Bamboo-green maple and sakura leaves drift over the ink, so the
          Japanese half carries motion and the wok half carries bamboo. */}
      <LeafField2D count={9} />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 animate-hero-rise sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          {/* Phones get the mark first, at the top of the page. On desktop the
              ringed plate on the right carries it instead. */}
          <MobileHeroMark logoUrl={logoUrl} brand={brand} />

          <p
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-rice-100/20 bg-rice-100/8 px-3.5 py-1.5 text-xs font-medium tracking-wide text-rice-100/90"
          >
            <MapPin className="size-3.5 text-vermilion-300" aria-hidden="true" />
            {t("home.heroEyebrow", { city: stats.city })}
          </p>

          <p
            className="font-kana mt-5 text-sm font-semibold tracking-[0.35em] text-vermilion-300"
            aria-hidden="true"
          >
            {BRAND_SCRIPT_MARK}
          </p>

          <h1 className="mt-3 max-w-2xl font-display text-fluid-display font-bold text-rice-50 text-balance">
            {brand}
          </h1>

          <p className="mt-4 max-w-xl text-lg font-medium text-rice-200/90 text-pretty sm:text-xl">
            {tagline}
          </p>

          <span aria-hidden="true" className="ink-rule mt-5 block max-w-xs" />

          {!acceptingOrders ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-chili-300">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-chili-400" />
              {t("home.closedForOrders")}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/menu"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-vermilion-600 px-6 font-medium text-rice-50 shadow-washi transition-colors hover:bg-vermilion-700"
            >
              {hasMenu ? t("home.heroOrder") : t("home.viewMenu")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href="/about"
              className="glass-card inline-flex h-12 items-center justify-center rounded-xl border border-rice-100/25 px-6 font-medium text-rice-50 transition-colors hover:bg-rice-100/15"
            >
              {t("home.heroHowTo")}
            </Link>
          </div>

          {/* The hero's job is to get someone into the basket, so the one
              reassurance worth stating up front is that there is no app and no
              phone call in the way. */}
          <p className="mt-5 inline-flex items-start gap-2 text-sm text-rice-200/85">
            <Globe
              className="mt-0.5 size-4 shrink-0 text-vermilion-300"
              aria-hidden="true"
            />
            {t("home.heroOrderDirect")}
          </p>

          <HeroStats stats={stats} t={t} />
        </div>

        <BambooPlate logoUrl={logoUrl} brand={brand} />
      </div>
    </section>
  );
}

/**
 * The hero's proof strip: live figures read from the database.
 *
 * Every value is real — the dish count is the published menu, and the rating
 * only appears when customers have actually rated something. The strip is
 * omitted entirely rather than padded out when a value is missing, so it never
 * asserts a number the kitchen cannot stand behind.
 *
 * Delivery ETA and fee were removed from here by request. They are still
 * published, at the point where they actually matter: the checkout summary
 * and the menu's delivery hint, both fed by `settings.ordering`.
 */
function HeroStats({
  stats,
  t,
}: {
  stats: {
    dishCount: number;
    rating: { average: number; count: number } | null;
  };
  t: T;
}) {
  const entries: { icon: typeof Star; value: string; label: string }[] = [];

  if (stats.dishCount > 0) {
    entries.push({
      icon: Star,
      value: String(stats.dishCount),
      label: t("home.heroStatsDishes"),
    });
  }
  if (stats.rating) {
    entries.push({
      icon: Star,
      value: stats.rating.average.toFixed(1),
      label: t("home.heroStatRating"),
    });
  }

  if (entries.length === 0) return null;

  return (
    <dl className="mt-9 grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 border-t border-rice-100/15 pt-6">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-start gap-2.5">
          <entry.icon
            className="mt-0.5 size-4 shrink-0 text-vermilion-300"
            aria-hidden="true"
          />
          <div>
            <dt className="sr-only">{entry.label}</dt>
            <dd className="font-display text-xl font-semibold text-rice-50 tabular-nums">
              {entry.value}
            </dd>
            <p className="text-2xs text-rice-200/70">{entry.label}</p>
          </div>
        </div>
      ))}
    </dl>
  );
}

/**
 * The closing band above the footer.
 *
 * `band-rose` rather than the vermilion band: it is the last thing before the
 * footer, and a second saturated red field would compete with the popular band
 * instead of settling the page. Contact affordances are rendered only for
 * channels the kitchen has actually filled in.
 */
function ClosingCta({
  brand,
  city,
  phone,
  whatsapp,
  t,
}: {
  brand: string;
  city: string;
  phone: string | null;
  whatsapp: string | null;
  t: T;
}) {
  const waHref = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "").replace(/^0/, "20")}`
    : null;

  return (
    <section
      aria-labelledby="closing-heading"
      className="relative isolate mt-6 overflow-x-clip pb-16"
    >
      <div
        aria-hidden="true"
        className="band-rose band-layer band-layer-curve-top"
      />
      <div className="relative mx-auto max-w-6xl px-4 pt-14 text-center">
        <Reveal variant="zoom">
          <h2
            id="closing-heading"
            className="font-display text-fluid-h2 font-semibold text-ink-900"
          >
            {t("home.closingTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-700/85">
            {t("home.closingBody", { city })}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/menu"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-vermilion-600 px-7 font-medium text-rice-50 shadow-washi transition-colors hover:bg-vermilion-700 sm:w-auto"
            >
              {t("home.closingCta")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>

            {phone ? (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink-900/15 bg-white/70 px-7 font-medium text-ink-900 transition-colors hover:border-vermilion-600/40 hover:bg-white sm:w-auto"
              >
                {t("home.closingCall")}
              </a>
            ) : null}

            {waHref ? (
              <a
                href={waHref}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink-900/15 bg-white/70 px-7 font-medium text-ink-900 transition-colors hover:border-vermilion-600/40 hover:bg-white sm:w-auto"
              >
                {t("home.closingWhatsapp")}
              </a>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The mark at the top of the phone layout.
 *
 * On desktop the logo sits in a large ringed plate to the right of the copy; on
 * a phone there is no room for that, and the logo previously did not appear on
 * the home page at all. This puts it first, above the badges, at a size that
 * reads as a brand mark rather than a favicon — with the logo's own colours on
 * the rice ground, no forced recolouring.
 */
function MobileHeroMark({ logoUrl, brand }: { logoUrl: string; brand: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 lg:hidden">
      {/* The mark is a vector asset served from this origin, so it needs no
          resize transform and no CDN query — those only forced a raster round
          trip. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={brand}
        width={180}
        height={180}
        className="size-14 rounded-2xl object-contain"
      />
      <span
        aria-hidden="true"
        className="h-10 w-px bg-gradient-to-b from-transparent via-rice-100/25 to-transparent"
      />
      <span className="font-display text-xl font-semibold tracking-tight text-rice-50">
        {brand}
      </span>
    </div>
  );
}

/** A bamboo-ringed plate holding the real brand mark — the hero's focal art. */
function BambooPlate({ logoUrl, brand }: { logoUrl: string; brand: string }) {
  return (
    <div
      aria-hidden="true"
      data-motion="decorative"
      className="relative mx-auto hidden aspect-square w-full max-w-sm place-items-center lg:grid"
    >
      <span className="absolute inset-0 rounded-full border border-bamboo-400/30" />
      <span className="asanoha absolute inset-4 rounded-full opacity-25" />
      <span className="absolute inset-10 rounded-full border border-dashed border-rice-100/15" />
      <span className="absolute inset-16 rounded-full bg-rice-50/95 shadow-washi-lg" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={brand}
        width={180}
        height={180}
        className="relative size-40 object-contain"
      />
    </div>
  );
}
