import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Navigation, Store, Truck } from "lucide-react";
import { buildMetadata } from "@/lib/seo/metadata";
import { getPublicSettings, getRestaurant } from "@/lib/services/catalog";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/customer/breadcrumbs";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getPublicSettings(), getLocale()]);
  const t = await getT(locale);
  return buildMetadata({
    title: t("location.metaTitle", {
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    description: t("location.metaDescription", {
      brand: settings.brand.name,
      city: settings.brand.city,
    }),
    path: "/location",
    siteName: settings.brand.name,
    locale,
  });
}

/**
 * Location and delivery. This page exists so "where is Panda Wok" has a real
 * URL to rank, and so the local entity (name + city + delivery facts) is stated
 * in HTML text rather than only in structured data.
 *
 * It never invents an address: when the street address is unpublished the page
 * says so, and the Maps link is omitted instead of pointing at a guess.
 */
export default async function LocationPage() {
  const [settings, restaurant, locale] = await Promise.all([
    getPublicSettings(),
    getRestaurant(),
    getLocale(),
  ]);
  const t = await getT(locale);

  const brand = restaurant?.name_en ?? settings.brand.name;
  const city = restaurant?.city ?? settings.brand.city;
  const country = restaurant?.country ?? settings.brand.country;
  const hasPin = restaurant?.latitude != null && restaurant?.longitude != null;
  const mapsUrl = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${restaurant!.latitude},${restaurant!.longitude}`
    : null;

  // The (site) layout already emits the Restaurant/LocalBusiness node for every
  // public page; re-declaring the same @id here would duplicate and potentially
  // conflict with it. This page adds only its own breadcrumb.
  const structured = [
    breadcrumbSchema([
      { name: t("common.home"), path: "/" },
      { name: t("location.title", { brand, city }), path: "/location" },
    ]),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumbs
        items={[
          { name: t("common.home"), path: "/" },
          { name: t("location.title", { brand, city }), path: "/location" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
          {t("location.title", { brand, city })}
        </h1>
        <p className="mt-1.5 text-sm text-ink-700/85">
          {t("location.subtitle", { brand })}
        </p>
      </header>

      <section aria-labelledby="area-heading" className="washi-panel mt-5 p-4">
        <h2
          id="area-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <MapPin className="size-4 text-indigo-600" aria-hidden="true" />
          {t("location.areaHeading")}
        </h2>
        <p className="mt-2 text-sm text-ink-700/85">
          {restaurant?.area ? `${restaurant.area}, ` : ""}
          {city}, {country}
        </p>
        {hasPin ? (
          <a
            href={mapsUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-ink-900/15 px-4 text-sm font-medium text-ink-900 hover:bg-rice-200"
          >
            <Navigation className="size-4" aria-hidden="true" />
            {t("location.directionsLink")}
          </a>
        ) : null}
      </section>

      <section aria-labelledby="directions-heading" className="washi-panel mt-3 p-4">
        <h2 id="directions-heading" className="text-sm font-semibold text-ink-900">
          {t("location.directionsHeading")}
        </h2>
        <p className="mt-2 text-sm text-ink-700/85">
          {hasPin
            ? `${city}, ${country}`
            : t("location.cityOnly", { city, country })}
        </p>
        {!hasPin ? (
          <p className="mt-1 text-xs text-ink-700/70">{t("location.directionsPending")}</p>
        ) : null}
      </section>

      <section aria-labelledby="delivery-heading" className="washi-panel mt-3 p-4">
        <h2
          id="delivery-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <Truck className="size-4 text-indigo-600" aria-hidden="true" />
          {t("location.deliveriesHeading")}
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">{t("contact.minimumOrder")}</dt>
            <dd className="tabular-nums text-ink-900">
              {settings.ordering.minOrderTotal} {restaurant?.currency ?? "EGP"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">{t("contact.deliveryFee")}</dt>
            <dd className="tabular-nums text-ink-900">
              {settings.ordering.deliveryFee} {restaurant?.currency ?? "EGP"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">{t("contact.freeDeliveryOver")}</dt>
            <dd className="tabular-nums text-ink-900">
              {settings.ordering.freeDeliveryOver} {restaurant?.currency ?? "EGP"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-700/85">{t("contact.typicalDeliveryTime")}</dt>
            <dd className="tabular-nums text-ink-900">
              {t("contact.minutesValue", { minutes: settings.ordering.etaMinutes })}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="collection-heading" className="washi-panel mt-3 p-4">
        <h2
          id="collection-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"
        >
          <Store className="size-4 text-indigo-600" aria-hidden="true" />
          {t("location.collectionHeading")}
        </h2>
        <p className="mt-2 text-sm text-ink-700/85">{t("location.collectionBody")}</p>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/menu"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-6 font-medium text-rice-50 hover:bg-indigo-700 sm:flex-1"
        >
          {t("location.startOrder")}
        </Link>
        <Link
          href="/contact"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-900/15 px-6 font-medium text-ink-900 hover:bg-rice-200 sm:flex-1"
        >
          {t("location.contactUs")}
        </Link>
      </div>

      <JsonLdScript data={structured} />
    </div>
  );
}
