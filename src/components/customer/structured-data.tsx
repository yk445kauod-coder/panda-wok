"use client";

import { useStore, useStoreShell } from "@/components/customer/store-data";
import { JsonLdScript } from "@/components/seo/json-ld";
import {
  organisationSchema,
  restaurantSchema,
  websiteSchema,
} from "@/lib/seo/schema";
import { brandDescription, brandName, brandTagline, localisedPlace } from "@/lib/i18n/brand";
import type { Locale } from "@/lib/i18n/config";

/**
 * The site-level structured data (website, organisation, restaurant).
 *
 * It used to render in the locale layout, which read the settings and the
 * restaurant row on the Worker on every request. Now the shell is static, so the
 * graph is built in the browser from the same client store the header uses — the
 * values are identical, they just arrive after paint. Crawlers that execute JS
 * see it; the page-level `product`/`breadcrumb` graphs, which do not depend on
 * the settings, still render on the server.
 */
export function StructuredData({ locale }: { locale: Locale }) {
  const { data: store } = useStore();
  const { brand: shellBrand, contact, settings } = useStoreShell();
  if (!settings) return null;

  const restaurant = store?.restaurant ?? null;
  const brand = {
    name: brandName(restaurant, locale, shellBrand.name),
    city: localisedPlace(restaurant?.city ?? settings.brand.city, locale),
    country: localisedPlace(restaurant?.country ?? settings.brand.country, locale),
    tagline: brandTagline(restaurant, locale, settings.brand.tagline),
  };

  const graph = [
    websiteSchema({ name: brand.name, description: `${brand.tagline}.` }),
    organisationSchema({ name: brand.name, social: contact.social }),
    restaurantSchema({
      name: brand.name,
      description: brandDescription(restaurant, locale, "") || null,
      tagline: brand.tagline,
      cuisineTags: restaurant?.cuisine_tags ?? [],
      city: restaurant?.city ?? settings.brand.city,
      country: restaurant?.country ?? settings.brand.country,
      area: restaurant?.area ?? null,
      latitude: restaurant?.latitude ?? null,
      longitude: restaurant?.longitude ?? null,
      phone: contact.phone,
      email: contact.email,
      social: contact.social,
      openingHours: (contact.openingHours ?? {}) as Record<string, unknown>,
      currency: restaurant?.currency ?? "EGP",
    }),
  ];

  return <JsonLdScript data={graph} />;
}
