"use client";

import { createContext, useContext, useMemo } from "react";
import { usePublicData } from "@/lib/public/client";
import type { Locale } from "@/lib/i18n/config";
import type {
  Category,
  FeatureFlag,
  MenuItem,
  MenuRating,
  PublicSettings,
  Restaurant,
} from "@/lib/services/catalog";
import type { AnnouncementRow } from "@/lib/services/content";

/**
 * The storefront's one data read.
 *
 * The customer shell (header, footer, brand, flags) and every page body need
 * almost the same catalogue, and the pages are static shells now — the Worker
 * no longer renders any of it. This provider fetches `/api/public/bootstrap`
 * once per locale and hands the parsed result to the shell and to every page,
 * so a navigation costs one request instead of three and no page awaits a
 * server render.
 */
export type StoreData = {
  locale: Locale;
  settings: PublicSettings;
  flags: Record<string, boolean>;
  restaurant: Restaurant | null;
  categories: Category[];
  menu: { categories: Category[]; items: MenuItem[] };
  ratings: Record<string, MenuRating>;
  featured: MenuItem[];
  announcements: AnnouncementRow[];
};

type StoreValue = {
  data: StoreData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreDataProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const { data, loading, error, reload } = usePublicData<StoreData>(
    "/api/public/bootstrap",
    { locale },
  );
  const value = useMemo<StoreValue>(
    () => ({ data, loading, error, reload }),
    [data, loading, error, reload],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Full state, for a page that renders its own loading and error states. */
export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreDataProvider");
  return ctx;
}

/**
 * The shell's view: brand and flags with safe defaults.
 *
 * The header and footer render on the very first paint, before the bootstrap
 * response lands, so they need a value that is never null — an empty flag map
 * means "everything on", which is the same default the server pages used.
 */
export function useStoreShell(): {
  brand: {
    name: string;
    city: string;
    country: string;
    tagline: string;
    logo_url: string | null;
  };
  contact: PublicSettings["support"];
  flags: Record<string, boolean>;
  settings: PublicSettings | null;
  loading: boolean;
} {
  const { data, loading } = useStore();
  return {
    brand: {
      name: data?.settings.brand.name ?? "Panda Wok",
      city: data?.settings.brand.city ?? "Alexandria",
      country: data?.settings.brand.country ?? "Egypt",
      tagline: data?.settings.brand.tagline ?? "",
      logo_url: data?.settings.brand.logo_url ?? null,
    },
    contact:
      data?.settings.support ??
      {
        phone: null,
        phoneSecondary: null,
        email: null,
        instapayUrl: null,
        social: {},
        openingHours: {},
      },
    flags: data?.flags ?? {},
    settings: data?.settings ?? null,
    loading,
  };
}

export type { FeatureFlag };
