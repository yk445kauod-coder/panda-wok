import { absoluteUrl, siteUrl } from "@/lib/seo/metadata";

export type JsonLd = Record<string, unknown>;

/**
 * Restaurant + LocalBusiness node. Only fields that are actually known are
 * emitted: no invented address, phone number or opening hours. Absent values
 * are simply omitted, which is valid structured data and honest.
 */
export function restaurantSchema(params: {
  name: string;
  description: string | null;
  tagline: string | null;
  cuisineTags: string[];
  city: string | null;
  country: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  social: Record<string, string>;
  openingHours: Record<string, unknown>;
  currency: string;
  priceRange?: string;
}): JsonLd {
  const sameAs = Object.values(params.social).filter(Boolean);

  const address: JsonLd = {
    "@type": "PostalAddress",
    addressLocality: params.city ?? undefined,
    addressRegion: params.area ?? undefined,
    addressCountry: params.country ?? undefined,
  };

  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": ["Restaurant", "LocalBusiness"],
    "@id": `${siteUrl()}/#restaurant`,
    name: params.name,
    url: siteUrl(),
    description: params.description ?? params.tagline ?? undefined,
    servesCuisine: params.cuisineTags.length > 0 ? params.cuisineTags : undefined,
    address,
    currenciesAccepted: params.currency,
    priceRange: params.priceRange ?? "$$",
    image: absoluteUrl("/opengraph-image"),
    hasMenu: absoluteUrl("/menu"),
  };

  if (params.phone) node.telephone = params.phone;
  if (params.email) node.email = params.email;
  if (sameAs.length > 0) node.sameAs = sameAs;

  if (params.latitude !== null && params.longitude !== null) {
    node.geo = {
      "@type": "GeoCoordinates",
      latitude: params.latitude,
      longitude: params.longitude,
    };
  }

  // Opening hours are only emitted when the operator has actually published
  // them, as a proper OpeningHoursSpecification list.
  const specs = Object.entries(params.openingHours ?? {})
    .map(([day, value]) => {
      if (!Array.isArray(value) || value.length < 2) return null;
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase()}${day.slice(1)}`,
        opens: String(value[0]),
        closes: String(value[1]),
      };
    })
    .filter(Boolean);

  if (specs.length > 0) node.openingHoursSpecification = specs;

  return node;
}

export function organisationSchema(params: {
  name: string;
  social: Record<string, string>;
  logoUrl?: string;
}): JsonLd {
  const sameAs = Object.values(params.social).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organisation`,
    name: params.name,
    url: siteUrl(),
    logo: params.logoUrl ?? absoluteUrl("/panda-logo.svg"),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function websiteSchema(params: { name: string; description: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: params.name,
    url: siteUrl(),
    description: params.description,
    publisher: { "@id": `${siteUrl()}/#organisation` },
    inLanguage: ["en", "ar"],
    /**
     * AEO: answer engines and voice assistants may read these sections aloud,
     * so they are declared explicitly rather than left to heuristics.
     */
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "#main", "[data-speakable]"],
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl()}/menu?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function menuSchema(params: {
  name: string;
  description: string | null;
  url: string;
  items: {
    slug: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    image: string | null;
    category: string;
    available: boolean;
    vegetarian: boolean;
    vegan: boolean;
  }[];
}): JsonLd {
  const groups = new Map<string, typeof params.items>();
  for (const item of params.items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }

  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${absoluteUrl(params.url)}#menu`,
    name: params.name,
    description: params.description ?? undefined,
    url: absoluteUrl(params.url),
    inLanguage: ["en", "ar"],
    hasMenuSection: [...groups.entries()].map(([section, items]) => ({
      "@type": "MenuSection",
      name: section,
      hasMenuItem: items.map((item) => menuItemSchema(item, params.url)),
    })),
  };
}

function menuItemSchema(
  item: {
    slug: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    image: string | null;
    available: boolean;
    vegetarian: boolean;
    vegan: boolean;
  },
  basePath: string,
): JsonLd {
  return {
    "@type": "MenuItem",
    name: item.name,
    description: item.description ?? undefined,
    url: absoluteUrl(`${basePath}/${item.slug}`),
    image: item.image ?? undefined,
    offers: {
      "@type": "Offer",
      price: item.price.toFixed(2),
      priceCurrency: item.currency,
      availability: item.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: absoluteUrl(`${basePath}/${item.slug}`),
    },
    suitableForDiet: item.vegan
      ? ["https://schema.org/VeganDiet", "https://schema.org/VegetarianDiet"]
      : item.vegetarian
        ? ["https://schema.org/VegetarianDiet"]
        : undefined,
  };
}

export function productSchema(item: {
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  image: string | null;
  available: boolean;
  category: string;
  brand?: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.description ?? undefined,
    image: item.image ?? undefined,
    category: item.category,
    url: absoluteUrl(`/menu/${item.slug}`),
    brand: { "@type": "Brand", name: item.brand ?? "Panda Wok" },
    offers: {
      "@type": "Offer",
      price: item.price.toFixed(2),
      priceCurrency: item.currency,
      availability: item.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: absoluteUrl(`/menu/${item.slug}`),
    },
  };
}

